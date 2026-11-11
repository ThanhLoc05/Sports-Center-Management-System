package com.sportscenter.management.service;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
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
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Real HTTP/SQL with in-memory mail only. Never targets the application database. */
@EnabledIfSystemProperty(named="sportiva.security-sql", matches="true")
@SpringBootTest(classes={SportsCenterApplication.class,SecurityRoleFlowsSqlServerIT.Mail.class},webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT,properties={
 "server.port=8082","server.address=127.0.0.1","server.shutdown=immediate",
 "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaSecurity_20261112;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaSecurityHTTPIT",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate","spring.sql.init.mode=never",
 "spring.flyway.enabled=false","spring.liquibase.enabled=false","app.me09.scheduling-enabled=false","spring.jpa.open-in-view=false",
 "app.frontend-base-url=http://127.0.0.1:5175","logging.level.root=WARN","logging.level.org.springframework=ERROR","logging.level.org.hibernate=OFF","logging.level.org.springframework.security=OFF"})
class SecurityRoleFlowsSqlServerIT {
 @TestConfiguration static class Mail{@Bean @Primary JavaMailSender isolatedMail(){return mock(JavaMailSender.class);}}
 @Autowired JdbcTemplate jdbc; @Autowired UserRepository users; @Autowired RoleRepository roles; @Autowired PasswordEncoder encoder; @Autowired JavaMailSender mail;
 @LocalServerPort int port;
 final HttpClient http=HttpClient.newHttpClient();
 record Actor(int id,String email,String password,String role,String jwt){}
 Actor member,coach,reception,manager,other;
 @BeforeEach void setup()throws Exception{
  assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaSecurity_20261112",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
  reset(mail);member=actor("MEMBER");coach=actor("COACH");reception=actor("RECEPTIONIST");manager=actor("CENTER_MANAGER");other=actor("MEMBER");
 }
 Actor actor(String role)throws Exception{
  String id=UUID.randomUUID().toString().replace("-","");String password=UUID.randomUUID()+"A1";
  User u=users.saveAndFlush(User.builder().email(id+"@example.com").fullName("Isolated "+role).phone("09"+Long.toString(System.nanoTime()).substring(0,8)).passwordHash(encoder.encode(password)).emailVerified(true).role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build());
  var response=call("POST","/users/login","{\"email\":\""+u.getEmail()+"\",\"password\":\""+password+"\"}",null,null);
  assertEquals(200,response.statusCode());return new Actor(u.getId(),u.getEmail(),password,role,JsonPath.read(response.body(),"$.token"));
 }
 HttpResponse<String> call(String method,String path,String body,String jwt,String key)throws Exception{
  var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1"+path)).timeout(Duration.ofSeconds(20)).header("Content-Type","application/json");
  if(jwt!=null)b.header("Authorization","Bearer "+jwt);if(key!=null)b.header("Idempotency-Key",key);
  return http.send(b.method(method,HttpRequest.BodyPublishers.ofString(body==null?"":body)).build(),HttpResponse.BodyHandlers.ofString());
 }
 HttpResponse<String> checked(Actor actor,String name,int expected,String method,String path,String body,String key)throws Exception{
  var r=call(method,path,body,actor==null?null:actor.jwt(),key);
  System.out.println("SECURITY_CHECK|"+(actor==null?"ANONYMOUS":actor.role())+"|"+name+"|"+r.statusCode()+"|"+expected);
  assertEquals(expected,r.statusCode(),name);return r;
 }
 String capability(){var captor=org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);verify(mail,atLeastOnce()).send(captor.capture());return captor.getAllValues().getLast().getText().split("token=")[1].split("\\s")[0];}
 @Test void authenticatedRolesOwnershipAndInactiveAccounts()throws Exception{
  for(Actor a:List.of(member,coach,reception,manager)){
   checked(a,"own identity",200,"GET","/users/"+a.id(),null,null);
   checked(a,"users directory",List.of("RECEPTIONIST","CENTER_MANAGER").contains(a.role())?200:403,"GET","/users",null,null);
   checked(a,"audit permission",a==manager?200:403,"GET","/audit-logs",null,null);
  }
  checked(member,"nonowner profile",403,"GET","/users/"+other.id()+"/profile",null,null);
  checked(coach,"unassigned profile",403,"GET","/users/"+other.id()+"/profile",null,null);
  checked(member,"cannot confirm cash",403,"POST","/membership-orders/1/confirm-payment","{\"version\":0}",UUID.randomUUID().toString());
  checked(member,"cannot assign role",403,"PATCH","/users/"+other.id()+"/role?roleName=COACH",null,null);
  checked(reception,"cannot assign role",403,"PATCH","/users/"+other.id()+"/role?roleName=COACH",null,null);
  checked(reception,"cannot refund",403,"POST","/payments/invoices/1/refund",null,null);
  checked(null,"anonymous users",401,"GET","/users",null,null);
  jdbc.update("UPDATE users SET status='INACTIVE' WHERE user_id=?",other.id());
  checked(other,"inactive JWT",401,"GET","/users/"+other.id(),null,null);
  var login=call("POST","/users/login","{\"email\":\""+other.email()+"\",\"password\":\""+other.password()+"\"}",null,null);assertEquals(401,login.statusCode());
  jdbc.update("UPDATE users SET status='ACTIVE',email_verified=0 WHERE user_id=?",other.id());
  checked(other,"unverified JWT",401,"GET","/users/"+other.id(),null,null);
 }
 @Test void passwordChangeAndResetRevokeOldHttpTokens()throws Exception{
  String next=UUID.randomUUID()+"B2";
  checked(member,"change password",200,"POST","/users/"+member.id()+"/change-password","{\"oldPassword\":\""+member.password()+"\",\"newPassword\":\""+next+"\"}",null);
  checked(member,"old token revoked after change",401,"GET","/users/"+member.id(),null,null);
  var login=call("POST","/users/login","{\"email\":\""+member.email()+"\",\"password\":\""+next+"\"}",null,null);assertEquals(200,login.statusCode());
  Actor updated=new Actor(member.id(),member.email(),next,"MEMBER",JsonPath.read(login.body(),"$.token"));
  checked(updated,"new token valid",200,"GET","/users/"+updated.id(),null,null);
  checked(null,"request reset mock mail",200,"POST","/users/forgot-password","{\"email\":\""+updated.email()+"\"}",null);
  String cap=capability();String reset=UUID.randomUUID()+"C3";
  checked(null,"reset password",200,"POST","/users/reset-password","{\"token\":\""+cap+"\",\"newPassword\":\""+reset+"\"}",null);
  checked(updated,"old token revoked after reset",401,"GET","/users/"+updated.id(),null,null);
  checked(null,"one time reset",400,"POST","/users/reset-password","{\"token\":\""+cap+"\",\"newPassword\":\""+reset+"\"}",null);
 }
 @Test void cashMembershipBookingCoachAttendanceAndRenewal()throws Exception{
  int pkg=jdbc.queryForObject("SELECT TOP(1) package_id FROM membership_packages WHERE status='ACTIVE' ORDER BY package_id",Integer.class);
  String body="{\"memberId\":"+member.id()+",\"packageId\":"+pkg+",\"paymentMethod\":\"CASH\"}";String key=UUID.randomUUID().toString();
  var created=checked(member,"new checkout pending",201,"POST","/membership-orders",body,key);int order=JsonPath.read(created.body(),"$.id");
  var retry=checked(member,"checkout retry",201,"POST","/membership-orders",body,key);assertEquals(order,(int)JsonPath.read(retry.body(),"$.id"));
  assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions WHERE member_id=?",Integer.class,member.id()));
  int version=JsonPath.read(created.body(),"$.version");String confirmKey=UUID.randomUUID().toString();
  checked(reception,"confirm cash",200,"POST","/membership-orders/"+order+"/confirm-payment","{\"version\":"+version+"}",confirmKey);
  int sub=jdbc.queryForObject("SELECT subscription_id FROM invoices WHERE membership_order_id=?",Integer.class,order);
  assertEquals("PAID",jdbc.queryForObject("SELECT payment_status FROM invoices WHERE membership_order_id=?",String.class,order));
  checked(other,"nonowner order",403,"GET","/membership-orders/"+order,null,null);
  var room=checked(manager,"create room",201,"POST","/rooms","{\"roomName\":\"Security "+UUID.randomUUID()+"\",\"capacity\":10}",null);int roomId=JsonPath.read(room.body(),"$.id");
  int sport=jdbc.queryForObject("SELECT TOP(1) sport_id FROM sports ORDER BY sport_id",Integer.class);
  String classBody="{\"className\":\"Security HTTP class\",\"sportId\":"+sport+",\"roomId\":"+roomId+",\"coachId\":"+coach.id()+",\"maxCapacity\":5,\"durationMinutes\":60,\"scheduleTime\":\""+LocalDateTime.now().plusDays(2).withNano(0)+"\",\"requiredAccessLevel\":\"STANDARD\"}";
  var clazz=checked(manager,"create class",201,"POST","/classes",classBody,null);int classId=JsonPath.read(clazz.body(),"$.id");
  checked(member,"cannot create class",403,"POST","/classes",classBody,null);
  checked(manager,"invalid class duration",400,"PUT","/classes/"+classId,"{\"durationMinutes\":0}",null);
  checked(member,"book class",201,"POST","/classes/"+classId+"/book",null,null);
  checked(member,"duplicate booking",400,"POST","/classes/"+classId+"/book",null,null);
  checked(coach,"assigned roster",200,"GET","/classes/"+classId+"/bookings",null,null);
  Actor unassigned=actor("COACH");
  checked(unassigned,"unassigned roster",403,"GET","/classes/"+classId+"/bookings",null,null);
  checked(member,"cannot read private roster",403,"GET","/classes/"+classId+"/bookings",null,null);
  String att="{\"classId\":"+classId+",\"memberId\":"+member.id()+",\"status\":\"PRESENT\"}";
  checked(member,"cannot record attendance",403,"POST","/attendance",att,null);
  checked(coach,"attendance current policy",201,"POST","/attendance",att,null);
  checked(coach,"duplicate attendance",400,"POST","/attendance",att,null);
  checked(unassigned,"unassigned attendance",403,"POST","/attendance",att,null);
  checked(member,"own attendance",200,"GET","/attendance/members/"+member.id()+"?startDate="+LocalDate.now()+"&endDate="+LocalDate.now(),null,null);
  var profileUpdate=checked(member,"profile update",200,"PUT","/users/"+member.id()+"/profile","{\"address\":\"Isolated test address\",\"fitnessGoals\":\"Safe test\"}",null);
  Actor refreshed=new Actor(member.id(),member.email(),member.password(),member.role(),JsonPath.read(profileUpdate.body(),"$.token"));
  checked(refreshed,"profile refreshed JWT",200,"GET","/users/"+member.id()+"/profile",null,null);
  checked(member,"profile persistence",200,"GET","/users/"+member.id()+"/profile",null,null);
  String renewal="{\"memberId\":"+member.id()+",\"packageId\":"+pkg+",\"sourceSubscriptionId\":"+sub+",\"paymentMethod\":\"CASH\"}";
  var renewalResult=checked(member,"renewal pending",201,"POST","/membership-orders",renewal,UUID.randomUUID().toString());int renewed=JsonPath.read(renewalResult.body(),"$.id");int rv=JsonPath.read(renewalResult.body(),"$.version");
  checked(reception,"confirm renewal",200,"POST","/membership-orders/"+renewed+"/confirm-payment","{\"version\":"+rv+"}",UUID.randomUUID().toString());
  int gaps=jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions a JOIN member_subscriptions b ON a.member_id=b.member_id AND a.subscription_id<b.subscription_id WHERE a.member_id=? AND b.start_date<>DATEADD(day,1,a.end_date)",Integer.class,member.id());assertEquals(0,gaps);
  int booking=jdbc.queryForObject("SELECT booking_id FROM class_bookings WHERE class_id=? AND member_id=?",Integer.class,classId,member.id());
  checked(reception,"assisted cancel",200,"DELETE","/bookings/"+booking,null,null);
  checked(coach,"roster after cancel",200,"GET","/classes/"+classId+"/students",null,null);
  checked(member,"booking after cancel",200,"GET","/members/"+member.id()+"/bookings",null,null);
  checked(manager,"reassign coach",200,"PUT","/classes/"+classId,"{\"coachId\":"+unassigned.id()+"}",null);
  checked(coach,"old coach loses roster",403,"GET","/classes/"+classId+"/bookings",null,null);
  checked(unassigned,"new coach gains roster",200,"GET","/classes/"+classId+"/bookings",null,null);
  checked(manager,"cancel class",200,"POST","/classes/"+classId+"/cancel",null,null);
  int renewalInvoice=jdbc.queryForObject("SELECT invoice_id FROM invoices WHERE membership_order_id=?",Integer.class,renewed);
  checked(manager,"internal refund",200,"POST","/payments/invoices/"+renewalInvoice+"/refund",null,null);
  assertEquals("REFUNDED",jdbc.queryForObject("SELECT status FROM membership_orders WHERE membership_order_id=?",String.class,renewed));
  assertEquals("CANCELLED",jdbc.queryForObject("SELECT s.status FROM member_subscriptions s JOIN invoices i ON s.subscription_id=i.subscription_id WHERE i.invoice_id=?",String.class,renewalInvoice));
  var summary=checked(manager,"summary",200,"GET","/reports/summary?startDate="+LocalDate.now().minusDays(1)+"T00:00:00&endDate="+LocalDate.now().plusDays(1)+"T00:00:00",null,null);
  java.math.BigDecimal sqlNet=jdbc.queryForObject("SELECT COALESCE(SUM(CASE WHEN payment_status IN('PAID','REFUNDED') AND COALESCE(paid_at,created_at) BETWEEN ? AND ? THEN amount ELSE 0 END),0)-COALESCE(SUM(CASE WHEN payment_status='REFUNDED' AND COALESCE(refunded_at,created_at) BETWEEN ? AND ? THEN amount ELSE 0 END),0) FROM invoices",java.math.BigDecimal.class,LocalDate.now().minusDays(1).atStartOfDay(),LocalDate.now().plusDays(1).atStartOfDay(),LocalDate.now().minusDays(1).atStartOfDay(),LocalDate.now().plusDays(1).atStartOfDay());
  Number apiNet=JsonPath.read(summary.body(),"$.netRevenue");assertEquals(0,sqlNet.compareTo(new java.math.BigDecimal(apiNet.toString())));
 }
 @Test void signupVerificationAndReplayProtection()throws Exception{
  String key=UUID.randomUUID().toString().replace("-","");String password=UUID.randomUUID()+"A1";String email=key+"@example.com";
  String body="{\"email\":\""+email+"\",\"password\":\""+password+"\",\"fullName\":\"Public security fixture\",\"phone\":\"08"+Long.toString(System.nanoTime()).substring(0,8)+"\"}";
  var signup=checked(null,"public signup",201,"POST","/users/register",body,null);int id=JsonPath.read(signup.body(),"$.id");
  assertEquals(0,jdbc.queryForObject("SELECT CONVERT(int,email_verified) FROM users WHERE user_id=?",Integer.class,id));
  checked(null,"unverified login",401,"POST","/users/login","{\"email\":\""+email+"\",\"password\":\""+password+"\"}",null);
  String cap=capability();checked(null,"verify capability",200,"POST","/users/verify-email","{\"token\":\""+cap+"\"}",null);
  checked(null,"verify replay",400,"POST","/users/verify-email","{\"token\":\""+cap+"\"}",null);
 }
 @Test @EnabledIfSystemProperty(named="sportiva.security-chrome",matches="true")
 void chromeReadOnlyFourRoles()throws Exception{
  java.nio.file.Path repository=java.nio.file.Path.of(System.getProperty("user.dir")).toAbsolutePath();
  if(!java.nio.file.Files.isRegularFile(repository.resolve("package.json")))repository=repository.getParent();
  String script=repository.resolve("scripts/tests/security-role-flows.mjs").toString();
  assertTrue(java.nio.file.Files.isRegularFile(java.nio.file.Path.of(script)),"Repository Chrome runner is missing");
  int sport=jdbc.queryForObject("SELECT TOP(1) sport_id FROM sports ORDER BY sport_id",Integer.class);
  int room=jdbc.queryForObject("SELECT TOP(1) room_id FROM rooms ORDER BY room_id",Integer.class);
  int classId=jdbc.queryForObject("INSERT INTO classes(class_name,sport_id,coach_id,room_id,schedule_time,duration_minutes,max_capacity,status,required_access_level) OUTPUT INSERTED.class_id VALUES('Browser isolated fixture',?,?,?,?,60,10,'SCHEDULED','STANDARD')",Integer.class,sport,coach.id(),room,LocalDateTime.now().plusHours(2));
  jdbc.update("INSERT INTO class_bookings(class_id,member_id,booked_at,status) VALUES(?,?,SYSDATETIME(),'BOOKED')",classId,member.id());
  jdbc.update("INSERT INTO member_profiles(member_id,address,fitness_goals) VALUES(?,?,?)",member.id(),"Isolated Chrome fixture","Safe test");
  StringJoiner accounts=new StringJoiner(",","[","]");
  for(var a:List.of(member,coach,reception,manager))accounts.add("{\"id\":"+a.id()+",\"email\":\""+a.email()+"\",\"password\":\""+a.password()+"\",\"role\":\""+a.role()+"\"}");
  var builder=new ProcessBuilder("node",script);builder.environment().put("SPORTIVA_ROLE_ACCOUNTS",accounts.toString());builder.environment().put("SPORTIVA_BROWSER_CLASS",Integer.toString(classId));
  builder.environment().put("SPORTIVA_TEST_FRONTEND_URL","http://127.0.0.1:5175");
  builder.environment().put("SPORTIVA_TEST_EVIDENCE_ROOT",System.getProperty("sportiva.evidence-dir",System.getProperty("java.io.tmpdir")));
  var browserLog=java.nio.file.Files.createTempFile("sportiva-security-chrome-",".log");
  builder.redirectErrorStream(true).redirectOutput(browserLog.toFile());
  Process process=builder.start();assertTrue(process.waitFor(150,java.util.concurrent.TimeUnit.SECONDS),"Browser timed out");
  System.out.println("SECURITY_CHROME_LOG="+browserLog);
  assertEquals(0,process.exitValue(),"Read browser evidence; no source auto-fix outside scope");
 }
}
