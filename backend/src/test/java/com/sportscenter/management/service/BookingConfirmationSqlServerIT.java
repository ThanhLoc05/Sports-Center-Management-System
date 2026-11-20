package com.sportscenter.management.service;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.sportscenter.management.service.impl.BookingServiceImpl;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="sportiva.inbox-sql", matches="true")
@SpringBootTest(classes=SportsCenterApplication.class, webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT, properties={
 "server.port=8187","server.address=127.0.0.1","server.shutdown=immediate",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate",
 "spring.sql.init.mode=never","spring.jpa.show-sql=false","spring.jpa.open-in-view=false",
 "app.me09.scheduling-enabled=false","app.demo.flow4.enabled=false",
 "logging.level.root=ERROR","logging.level.com.sportscenter=OFF","logging.level.org.hibernate=OFF",
 "logging.level.org.hibernate.SQL=OFF","logging.level.org.springframework=ERROR"})
class BookingConfirmationSqlServerIT {
 static String catalog() {
  String db=System.getProperty("sportiva.inbox-db","");
  if(!db.matches("SportivaInboxTest_[0-9]+"))throw new IllegalArgumentException("Explicit isolated inbox catalog required");
  return db;
 }
 @DynamicPropertySource static void database(DynamicPropertyRegistry p){
  p.add("spring.datasource.url",()->"jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName="+catalog()+";integratedSecurity=true;encrypt=true;trustServerCertificate=true");
 }
 @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
 @Autowired UserRepository users; @Autowired RoleRepository roles; @Autowired PasswordEncoder encoder;
 @Autowired RoomRepository rooms; @Autowired SportRepository sports; @Autowired ClassRepository classes;
 @Autowired MemberSubscriptionRepository subscriptions; @Autowired MembershipPackageRepository packages;
 @Autowired BookingServiceImpl booking; @Autowired PlatformTransactionManager tm;
 record Actor(int id,String email,String password,String token,String role){}
 final HttpClient http=HttpClient.newHttpClient();
 Actor member,other,reception,manager,coach; int first,second,overlap;LocalDateTime time;
 Actor actor(String role)throws Exception{
  String key=UUID.randomUUID().toString().replace("-",""),password=UUID.randomUUID()+"X9";
  var user=users.saveAndFlush(User.builder().email(key+"@example.com").phone("09"+key.substring(0,8)).fullName("Kiểm thử "+role)
   .passwordHash(encoder.encode(password)).emailVerified(true).role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build());
  var res=call(null,"POST","/users/login","{\"email\":\""+user.getEmail()+"\",\"password\":\""+password+"\"}");
  assertEquals(200,res.statusCode());
  return new Actor(user.getId(),user.getEmail(),password,JsonPath.read(res.body(),"$.token"),role);
 }
 HttpResponse<String> call(Actor a,String method,String path,String body)throws Exception{
  var req=HttpRequest.newBuilder(URI.create("http://127.0.0.1:8187/api/v1"+path)).timeout(Duration.ofSeconds(20)).header("Content-Type","application/json");
  if(a!=null)req.header("Authorization","Bearer "+a.token());
  return http.send(req.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
 }
 int clazz(String name,int coach,int room,int sport,LocalDateTime at){
  return classes.saveAndFlush(Classes.builder().className(name).coachId(coach).roomId(room).sportId(sport).scheduleTime(at).durationMinutes(60).maxCapacity(3).requiredAccessLevel("STANDARD").status("SCHEDULED").build()).getId();
 }
 @BeforeEach void fixture()throws Exception{
  assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|"+catalog(),jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
  member=actor("MEMBER");other=actor("MEMBER");coach=actor("COACH");reception=actor("RECEPTIONIST");manager=actor("CENTER_MANAGER");
  int room=rooms.saveAndFlush(Room.builder().roomName("Phòng "+UUID.randomUUID()).capacity(5).build()).getId();
  int sport=sports.saveAndFlush(Sport.builder().sportName("Yoga "+UUID.randomUUID()).build()).getId();
  time=LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(3).atTime(9,0);
  first=clazz("Lớp xác nhận A "+UUID.randomUUID().toString().substring(0,8),coach.id(),room,sport,time);
  second=clazz("Lớp xác nhận B "+UUID.randomUUID().toString().substring(0,8),coach.id(),room,sport,time.plusHours(2));
  Actor coach2=actor("COACH");
  int room2=rooms.saveAndFlush(Room.builder().roomName("Phòng "+UUID.randomUUID()).capacity(5).build()).getId();
  overlap=clazz("Lớp giao nhau",coach2.id(),room2,sport,time.plusHours(2));
  int pkg=packages.saveAndFlush(MembershipPackage.builder().packageName("Gói kiểm thử").price(new java.math.BigDecimal("500")).durationDays(30).accessLevel("STANDARD").status("ACTIVE").build()).getId();
  for(Actor m:List.of(member,other))subscriptions.saveAndFlush(MemberSubscription.builder().memberId(m.id()).packageId(pkg).startDate(LocalDate.now().minusDays(1)).endDate(LocalDate.now().plusDays(20)).status("ACTIVE").build());
 }
 int count(int memberId){return jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=? AND event_key LIKE 'BOOKING_CONFIRMED:%'",Integer.class,memberId);}
 @Test void selfAndAssistedCommitOnlyOneConfirmationAndRejectFailures()throws Exception{
  assertEquals(201,call(member,"POST","/classes/"+first+"/book",null).statusCode());assertEquals(1,count(member.id()));
  assertEquals(400,call(member,"POST","/classes/"+first+"/book",null).statusCode());assertEquals(1,count(member.id()));
  assertEquals(201,call(reception,"POST","/classes/"+second+"/book?memberId="+other.id(),null).statusCode());assertEquals(1,count(other.id()));
  assertEquals(400,call(other,"POST","/classes/"+overlap+"/book",null).statusCode());assertEquals(1,count(other.id()));
  String content=jdbc.queryForObject("SELECT content FROM general_notifications WHERE recipient_id=?",String.class,member.id());
  assertTrue(content.contains(classes.findById(first).orElseThrow().getClassName()));assertTrue(content.contains("09:00 ngày "+time.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy"))));
  var history=call(member,"GET","/notifications?page=0&size=100",null);assertEquals(200,history.statusCode());assertEquals(1,((List<?>)JsonPath.read(history.body(),"$.content")).size());
 }
 @Test void rolledBackBookingLeavesNeitherHistoryNorOutbox(){
  new TransactionTemplate(tm).executeWithoutResult(status->{booking.bookClass(first,member.id());assertEquals(1,count(member.id()));status.setRollbackOnly();});
  assertEquals(0,count(member.id()));
  assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings WHERE member_id=?",Integer.class,member.id()));
  assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,member.id()));
 }
 @Test @EnabledIfSystemProperty(named="sportiva.inbox-chrome",matches="true")
 void chromeDesktopMobileSseAndSchedule()throws Exception{
  Path root=Path.of("..").toAbsolutePath().normalize(),script=root.resolve("scripts/tests/notification-inbox.mjs");
  Path evidence=Path.of(System.getProperty("sportiva.inbox-evidence")).toAbsolutePath();
  assertFalse(evidence.startsWith(root),"Evidence must stay outside checkout");Files.createDirectories(evidence);
  String actors=String.join(",",List.of(member,other,reception,manager).stream().map(a->"{\"id\":"+a.id()+",\"email\":\""+a.email()+"\",\"password\":\""+a.password()+"\",\"role\":\""+a.role()+"\"}").toList());
  String input="{\"actors\":["+actors+"],\"first\":"+first+",\"second\":"+second+",\"overlap\":"+overlap+",\"time\":\""+time+"\"}";
  var builder=new ProcessBuilder("node",script.toString());builder.environment().put("INBOX_EVIDENCE_DIR",evidence.toString());builder.redirectErrorStream(true);builder.redirectOutput(evidence.resolve("chrome.log").toFile());
  var process=builder.start();try(var stdin=process.getOutputStream()){stdin.write(input.getBytes(StandardCharsets.UTF_8));}
  boolean finished=process.waitFor(180,TimeUnit.SECONDS);if(!finished)process.destroyForcibly();assertTrue(finished,"Chrome timed out");assertEquals(0,process.exitValue(),"See isolated Chrome evidence");
 }
}
