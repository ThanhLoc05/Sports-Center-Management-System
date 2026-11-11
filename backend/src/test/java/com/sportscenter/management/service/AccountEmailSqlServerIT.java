package com.sportscenter.management.service;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.jayway.jsonpath.JsonPath;

/** Opt-in, exact isolated catalog only; all mail is a Mockito sender, no SMTP. */
@EnabledIfSystemProperty(named="sportiva.email-sqlserver",matches="true")
@SpringBootTest(classes={SportsCenterApplication.class,AccountEmailSqlServerIT.Mail.class},webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
 "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaEmailIntegration_20261111;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaEmailIT",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate","spring.sql.init.mode=never",
 "app.me09.scheduling-enabled=false","spring.jpa.open-in-view=false","app.frontend-base-url=https://frontend.example.test",
 "server.address=127.0.0.1","logging.level.root=WARN","logging.level.org.springframework.web=OFF","logging.level.org.hibernate=OFF"})
class AccountEmailSqlServerIT {
    @TestConfiguration static class Mail { @Bean @Primary JavaMailSender mockMailSender(){return mock(JavaMailSender.class);} }
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired JavaMailSender mail;
    @Autowired UserRepository users;
    final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    @BeforeEach void guard() {
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaEmailIntegration_20261111",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
        reset(mail);
    }
    HttpResponse<String> call(String method,String path,String body,String jwt) throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/users/"+path))
                .timeout(Duration.ofSeconds(20)).header("Content-Type","application/json");
        if(jwt!=null)request.header("Authorization","Bearer "+jwt);
        return http.send(request.method(method,HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
    }
    String latestCapability() {
        var messages=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail,atLeastOnce()).send(messages.capture());
        return messages.getAllValues().getLast().getText().split("token=")[1].split("\\s")[0];
    }
    String login(String email,String password) throws Exception {
        var response=call("POST","login","{\"email\":\""+email+"\",\"password\":\""+password+"\"}",null);
        assertEquals(200,response.statusCode());return JsonPath.read(response.body(),"$.token");
    }
    @Test void realHttpSignupPendingEmailSingleUseResetAndAudit() throws Exception {
        String marker=UUID.randomUUID().toString().replace("-","");
        String email="emailit"+marker+"@example.com",next="changed"+marker+"@example.com";
        String password=UUID.randomUUID().toString()+"A1",newPassword=UUID.randomUUID().toString()+"B2";
        var registered=call("POST","register","{\"email\":\""+email+"\",\"password\":\""+password+"\",\"fullName\":\"Email Integration\",\"phone\":\""+"09"+Long.toString(System.nanoTime()).substring(0,8)+"\"}",null);
        assertEquals(201,registered.statusCode());int id=JsonPath.read(registered.body(),"$.id");
        assertEquals(401,call("POST","login","{\"email\":\""+email+"\",\"password\":\""+password+"\"}",null).statusCode());
        String signup=latestCapability();
        assertEquals(200,call("POST","verify-email","{\"token\":\""+signup+"\"}",null).statusCode());
        assertEquals(400,call("POST","verify-email","{\"token\":\""+signup+"\"}",null).statusCode());
        String jwt=login(email,password);
        // Simulate elapsed resend cooldown only on this fixture; never change the OS clock.
        jdbc.update("UPDATE account_action_tokens SET created_at=DATEADD(minute,-2,SYSDATETIME()) WHERE user_id=?",id);
        assertEquals(200,call("PUT",id+"/profile","{\"email\":\""+next+"\"}",jwt).statusCode());
        assertEquals(email,jdbc.queryForObject("SELECT email FROM users WHERE user_id=?",String.class,id));
        assertEquals(next,jdbc.queryForObject("SELECT pending_email FROM users WHERE user_id=?",String.class,id));
        login(email,password);
        assertEquals(401,call("POST","login","{\"email\":\""+next+"\",\"password\":\""+password+"\"}",null).statusCode());
        String change=latestCapability();
        var pool=Executors.newFixedThreadPool(2);
        try {
            var start=new CountDownLatch(1);
            var one=pool.submit(()->{start.await();return call("POST","verify-email","{\"token\":\""+change+"\"}",null).statusCode();});
            var two=pool.submit(()->{start.await();return call("POST","verify-email","{\"token\":\""+change+"\"}",null).statusCode();});
            start.countDown();assertEquals(Set.of(200,400),new HashSet<>(List.of(one.get(30,TimeUnit.SECONDS),two.get(30,TimeUnit.SECONDS))));
        }finally{pool.shutdownNow();}
        assertEquals(next,jdbc.queryForObject("SELECT email FROM users WHERE user_id=?",String.class,id));
        assertNull(jdbc.queryForObject("SELECT pending_email FROM users WHERE user_id=?",String.class,id));
        login(next,password);
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_id=? AND entity_id=? AND action='UPDATE'",Integer.class,id,id));
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_id=? AND entity_id=? AND action='EMAIL_VERIFIED'",Integer.class,id,id));
        assertEquals(200,call("POST","forgot-password","{\"email\":\""+next+"\"}",null).statusCode());
        String reset=latestCapability();
        assertEquals(200,call("POST","reset-password","{\"token\":\""+reset+"\",\"newPassword\":\""+newPassword+"\"}",null).statusCode());
        assertEquals(400,call("POST","reset-password","{\"token\":\""+reset+"\",\"newPassword\":\""+newPassword+"\"}",null).statusCode());
        login(next,newPassword);
        assertEquals(401,call("POST","login","{\"email\":\""+next+"\",\"password\":\""+password+"\"}",null).statusCode());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM account_action_tokens WHERE user_id=? AND (token_hash=? OR token_hash=?)",Integer.class,id,signup,reset));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_id=? AND (details LIKE '%token=%' OR details LIKE '%Bearer %' OR old_value IS NOT NULL OR new_value IS NOT NULL)",Integer.class,id));
    }
    @Test void smtpFailureRollsBackSignupAndTokenWithoutExposingProvider() throws Exception {
        String email="failed"+UUID.randomUUID().toString().replace("-","")+"@example.com";
        int before=jdbc.queryForObject("SELECT COUNT(*) FROM account_action_tokens",Integer.class);
        doThrow(new org.springframework.mail.MailSendException("private-provider-detail"))
                .when(mail).send(any(SimpleMailMessage.class));
        var response=call("POST","register","{\"email\":\""+email+"\",\"password\":\"test-only-password\",\"fullName\":\"Failed Mail Test\",\"phone\":\""+"08"+Long.toString(System.nanoTime()).substring(0,8)+"\"}",null);
        assertEquals(503,response.statusCode());assertFalse(response.body().contains("private-provider-detail"));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email=?",Integer.class,email));
        assertEquals(before,jdbc.queryForObject("SELECT COUNT(*) FROM account_action_tokens",Integer.class));
    }
}
