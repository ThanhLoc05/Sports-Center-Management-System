package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.controller.BookingController;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.MemberReminderService;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in real SQL transactions; never uses the application catalog. Fixtures are retained. */
@EnabledIfSystemProperty(named="sportiva.security-sql", matches="true")
@SpringBootTest(classes={SportsCenterApplication.class,BookingConcurrencySqlServerIT.Hooks.class},properties={
 "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaSecurity_20261112;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaBookingSecurityIT",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate","spring.sql.init.mode=never",
 "spring.flyway.enabled=false","spring.liquibase.enabled=false","app.me09.scheduling-enabled=false","spring.jpa.open-in-view=false"})
class BookingConcurrencySqlServerIT {
 @Autowired JdbcTemplate jdbc; @Autowired PlatformTransactionManager tm; @Autowired BookingController controller;
 @Autowired UserRepository users; @Autowired RoleRepository roles; @Autowired ClassRepository classes;
 @Autowired RoomRepository rooms; @Autowired SportRepository sports; @Autowired MembershipPackageRepository packages;
 @Autowired MemberSubscriptionRepository subscriptions;
 @MockitoBean MemberReminderService reminders;
 static final ThreadLocal<CyclicBarrier> snapshotBarrier=new ThreadLocal<>();
 @TestConfiguration static class Hooks {
  @Bean static BeanPostProcessor snapshotObserver(){return new BeanPostProcessor(){
   @Override public Object postProcessAfterInitialization(Object bean,String name){
    if(!(bean instanceof ClassBookingRepository))return bean;
    ProxyFactory p=new ProxyFactory(bean);p.addAdvice((MethodInterceptor)call->{
     Object result=call.proceed();
     if(call.getMethod().getName().equals("findByMemberId")&&snapshotBarrier.get()!=null) snapshotBarrier.get().await(10,TimeUnit.SECONDS);
     return result;
    });return p.getProxy();
   }
  };}
 }
 private int member,first,second;private String memberEmail,receptionEmail;private ExecutorService pool;
 @BeforeEach void fixture(){
  assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaSecurity_20261112",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
  pool=Executors.newFixedThreadPool(2);
  new TransactionTemplate(tm).executeWithoutResult(status->{
   String key=UUID.randomUUID().toString();
   User m=user(key+"m","MEMBER"),r=user(key+"r","RECEPTIONIST"),c1=user(key+"c1","COACH"),c2=user(key+"c2","COACH");
   member=m.getId();memberEmail=m.getEmail();receptionEmail=r.getEmail();
   int sport=sports.saveAndFlush(Sport.builder().sportName("booking-"+key).build()).getId();
   int room1=rooms.saveAndFlush(Room.builder().roomName("a-"+key).capacity(10).build()).getId();
   int room2=rooms.saveAndFlush(Room.builder().roomName("b-"+key).capacity(10).build()).getId();
   LocalDateTime start=LocalDateTime.now().plusDays(2).withNano(0);
   first=clazz("first",sport,room1,c1.getId(),start);second=clazz("second",sport,room2,c2.getId(),start.plusMinutes(30));
   int pkg=packages.saveAndFlush(MembershipPackage.builder().packageName("race-"+key).price(new BigDecimal("100000")).durationDays(30).accessLevel("STANDARD").status("ACTIVE").build()).getId();
   subscriptions.saveAndFlush(MemberSubscription.builder().memberId(member).packageId(pkg).startDate(LocalDate.now().minusDays(1)).endDate(LocalDate.now().plusDays(20)).status("ACTIVE").build());
  });
 }
 private User user(String key,String role){return users.saveAndFlush(User.builder().fullName("Isolated security fixture").email(key+"@example.com").phone(key).passwordHash("not-a-login-credential").emailVerified(true).role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build());}
 private int clazz(String name,int sport,int room,int coach,LocalDateTime start){return classes.saveAndFlush(Classes.builder().className(name).sportId(sport).roomId(room).coachId(coach).scheduleTime(start).durationMinutes(60).maxCapacity(10).requiredAccessLevel("STANDARD").status("SCHEDULED").build()).getId();}
 @AfterEach void cleanup(){pool.shutdownNow();snapshotBarrier.remove();SecurityContextHolder.clearContext();}
 private void race(boolean staff,boolean overlap)throws Exception{
  if(!overlap)new TransactionTemplate(tm).executeWithoutResult(s->{var c=classes.findById(second).orElseThrow();c.setScheduleTime(classes.findById(first).orElseThrow().getScheduleTime().plusHours(1));classes.saveAndFlush(c);});
  CyclicBarrier start=new CyclicBarrier(2),snapshot=new CyclicBarrier(2);
  List<Future<Throwable>> jobs=new ArrayList<>();
  for(int id:new int[]{first,second})jobs.add(pool.submit(()->{
   SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(staff?receptionEmail:memberEmail,"unused",staff?"ROLE_RECEPTIONIST":"ROLE_MEMBER"));
   if(overlap&&Boolean.getBoolean("sportiva.booking.baseline"))snapshotBarrier.set(snapshot);
   try{start.await(10,TimeUnit.SECONDS);new TransactionTemplate(tm).executeWithoutResult(s->assertEquals(201,controller.bookClass(id,staff?member:null).getStatusCode().value()));return null;}
   catch(Throwable e){return e;}finally{snapshotBarrier.remove();SecurityContextHolder.clearContext();}
  }));
  int success=0;for(var job:jobs){Throwable e=job.get(25,TimeUnit.SECONDS);if(e==null)success++;else assertTrue(e instanceof IllegalArgumentException,"Unexpected transaction failure: "+e.getClass().getSimpleName());}
  assertEquals(overlap?1:2,success,"Overlapping bookings must serialize on the same member");
  assertEquals(overlap?1:2,jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings WHERE member_id=? AND status='BOOKED'",Integer.class,member));
 }
 @Test void memberCannotBookOverlappingClassesConcurrently()throws Exception{race(false,true);}
 @Test void receptionistCannotBookOverlappingClassesForMemberConcurrently()throws Exception{race(true,true);}
 @Test void adjacentClassesRemainBookableConcurrently()throws Exception{race(false,false);}
}
