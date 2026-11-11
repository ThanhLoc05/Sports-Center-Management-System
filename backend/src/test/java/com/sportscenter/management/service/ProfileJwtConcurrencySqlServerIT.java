package com.sportscenter.management.service;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.*;
import com.jayway.jsonpath.JsonPath;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.*;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.net.*;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real HTTP and real committed SQL transactions; only mail and the scheduling gate are test doubles. */
@EnabledIfSystemProperty(named="sportiva.security-sql",matches="true")
@SpringBootTest(classes={SportsCenterApplication.class,ProfileJwtConcurrencySqlServerIT.Hooks.class},webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
 "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaSecurity_20261112;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaProfileJwtRaceIT",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate","spring.sql.init.mode=never",
 "spring.flyway.enabled=false","spring.liquibase.enabled=false","app.me09.scheduling-enabled=false","spring.jpa.open-in-view=false",
 "server.address=127.0.0.1","server.shutdown=immediate","app.frontend-base-url=http://127.0.0.1:5175"})
class ProfileJwtConcurrencySqlServerIT {
 record Gate(int userId,CountDownLatch committed,CountDownLatch resume){}
 static final AtomicReference<Gate> gate=new AtomicReference<>();
 @TestConfiguration static class Hooks {
  @Bean @Primary JavaMailSender mockMail(){return mock(JavaMailSender.class);}
  @Bean static BeanPostProcessor profileCommitGate(){return new BeanPostProcessor(){
   @Override public Object postProcessAfterInitialization(Object bean,String name){
    if(!(bean instanceof UserService))return bean;
    ProxyFactory proxy=new ProxyFactory(bean);
    proxy.addAdvice((MethodInterceptor)call->{
     Object result=call.proceed(); // inner transactional proxy has committed before this returns
     Gate g=gate.get();
     if(g!=null&&call.getMethod().getName().equals("updateProfile")&&Objects.equals(call.getArguments()[0],g.userId())){
      g.committed().countDown();
      if(!g.resume().await(15,TimeUnit.SECONDS))throw new IllegalStateException("Profile gate timed out");
     }
     return result;
    });return proxy.getProxy();
   }
  };}
 }
 @Autowired JdbcTemplate jdbc;@Autowired UserRepository users;@Autowired RoleRepository roles;@Autowired PasswordEncoder passwords;@Autowired JavaMailSender mail;
 @LocalServerPort int port;
 final HttpClient http=HttpClient.newHttpClient();
 String email,password,jwt;int id;
 @BeforeEach void fixture()throws Exception{
  assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaSecurity_20261112",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
  reset(mail);gate.set(null);String key=UUID.randomUUID().toString().replace("-","");email=key+"@example.com";password=UUID.randomUUID()+"A1";
  id=users.saveAndFlush(User.builder().email(email).fullName("Profile race fixture").phone("07"+Long.toString(System.nanoTime()).substring(0,8)).passwordHash(passwords.encode(password)).emailVerified(true).role(roles.findByRoleName("MEMBER").orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build()).getId();
  jwt=login(password);
 }
 @AfterEach void release(){var g=gate.getAndSet(null);if(g!=null)g.resume().countDown();http.close();}
 HttpResponse<String> call(String method,String path,String body,String token)throws Exception{
  var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/users"+path)).timeout(Duration.ofSeconds(25)).header("Content-Type","application/json");
  if(token!=null)b.header("Authorization","Bearer "+token);
  return http.send(b.method(method,HttpRequest.BodyPublishers.ofString(body==null?"":body)).build(),HttpResponse.BodyHandlers.ofString());
 }
 String login(String pwd)throws Exception{var r=call("POST","/login","{\"email\":\""+email+"\",\"password\":\""+pwd+"\"}",null);assertEquals(200,r.statusCode());return JsonPath.read(r.body(),"$.token");}
 int streamStatus(String token)throws Exception{
  var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/notifications/stream"))
    .timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+token).GET().build();
  var response=http.send(request,HttpResponse.BodyHandlers.ofInputStream());
  try(var body=response.body()){return response.statusCode();}
 }
 @ParameterizedTest @ValueSource(strings={"reset","change"})
 void inFlightProfileCannotRefreshRevokedSession(String mode)throws Exception{
  String resetToken=null;
  if(mode.equals("reset")){
   assertEquals(200,call("POST","/forgot-password","{\"email\":\""+email+"\"}",null).statusCode());
   var capture=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(mail).send(capture.capture());resetToken=capture.getValue().getText().split("token=")[1].split("\\s")[0];
  }
  Gate g=new Gate(id,new CountDownLatch(1),new CountDownLatch(1));gate.set(g);
  ExecutorService worker=Executors.newSingleThreadExecutor();
  try{
   Future<HttpResponse<String>> profile=worker.submit(()->call("PUT","/"+id+"/profile","{\"address\":\"Committed before password rotation\"}",jwt));
   assertTrue(g.committed().await(15,TimeUnit.SECONDS),"Profile did not reach post-commit gate");
   assertEquals("Committed before password rotation",jdbc.queryForObject("SELECT address FROM member_profiles WHERE member_id=?",String.class,id));
   String next=UUID.randomUUID()+"B2";
   var rotation=mode.equals("reset")?call("POST","/reset-password","{\"token\":\""+resetToken+"\",\"newPassword\":\""+next+"\"}",null):call("POST","/"+id+"/change-password","{\"oldPassword\":\""+password+"\",\"newPassword\":\""+next+"\"}",jwt);
   assertEquals(200,rotation.statusCode());g.resume().countDown();
   var result=profile.get(20,TimeUnit.SECONDS);
   boolean revived=false;
   if(result.statusCode()==200){String issued=JsonPath.read(result.body(),"$.token");revived=call("GET","/"+id,null,issued).statusCode()==200;}
   assertFalse(revived,"In-flight old session obtained a working JWT after "+mode);
   assertEquals(401,result.statusCode(),"Revoked profile refresh must request login again");
   assertEquals(401,call("GET","/"+id,null,jwt).statusCode());
   assertEquals(401,streamStatus(jwt),"Reconnect must revalidate revoked JWT");
   String newSession=login(next);
   assertEquals(200,call("GET","/"+id,null,newSession).statusCode());
   assertEquals(200,streamStatus(newSession),"New login may reconnect normally");
  }finally{g.resume().countDown();gate.set(null);worker.shutdownNow();}
 }
 @Test void normalProfileUpdateStillRefreshesValidSession()throws Exception{
  var r=call("PUT","/"+id+"/profile","{\"address\":\"Normal profile refresh\"}",jwt);assertEquals(200,r.statusCode());
  String refreshed=JsonPath.read(r.body(),"$.token");assertEquals(200,call("GET","/"+id+"/profile",null,refreshed).statusCode());
 }
}
