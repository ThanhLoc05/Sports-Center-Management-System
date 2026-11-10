package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.aop.framework.ProxyFactory;
import org.aopalliance.intercept.MethodInterceptor;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="sportiva.me09-sqlserver",matches="true")
@SpringBootTest(classes={SportsCenterApplication.class,Me09ReminderSqlServerIT.Hooks.class},properties={
 "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaME09ReminderIT_20261111;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=ME09ReminderIT",
 "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate",
 "spring.sql.init.mode=never","app.me09.scheduling-enabled=false","spring.jpa.show-sql=false"})
class Me09ReminderSqlServerIT {
 static final AtomicInteger observed=new AtomicInteger(-1),delivered=new AtomicInteger();
 @TestConfiguration static class Hooks {
  @Bean @Primary Me09OutboxSqlServerIT.TestClock clock(){return new Me09OutboxSqlServerIT.TestClock();}
  @Bean static BeanPostProcessor workerGate(){return new BeanPostProcessor(){
   @Override public Object postProcessAfterInitialization(Object bean,String name){
    if(!(bean instanceof MemberNotificationPublisher)&&!(bean instanceof NotificationDeliveryService))return bean;
    var proxy=new ProxyFactory(bean);proxy.setProxyTargetClass(true);proxy.addAdvice((MethodInterceptor)call->{
     if(bean instanceof MemberNotificationPublisher && call.getMethod().getName().equals("requestPublication"))return null;
     if(bean instanceof NotificationDeliveryService && call.getMethod().getName().equals("publishPersisted") && ((GeneralNotification)call.getArguments()[0]).getRecipientId()==observed.get()){
      assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());delivered.incrementAndGet();
     }return call.proceed();
    });return proxy.getProxy();
   }
  };}
 }
 @Autowired JdbcTemplate jdbc;@Autowired MemberReminderService reminders;@Autowired MemberReminderEligibility eligibility;
 @Autowired UserRepository users;@Autowired RoleRepository roles;@Autowired ClassRepository classes;@Autowired RoomRepository rooms;
 @Autowired SportRepository sports;@Autowired ClassBookingRepository bookings;@Autowired PlatformTransactionManager tm;
 @Autowired Me09OutboxSqlServerIT.TestClock clock;
 @Autowired BookingServiceImpl bookingService;
 @Autowired MemberNotificationPublisher publisher;
 int member,coach,room,sport,classId,pkg; LocalDateTime time;
 int actor(String role){String key=UUID.randomUUID().toString();return users.saveAndFlush(User.builder().email(key+"@example.test").phone(key).fullName("Reminder test").passwordHash("not-a-login-credential").role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build()).getId();}
 @BeforeEach void setup(){
  assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaME09ReminderIT_20261111",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
  clock.now.set(LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).atTime(9,0).atZone(clock.getZone()).toInstant());actor("CENTER_MANAGER");member=actor("MEMBER");coach=actor("COACH");
  observed.set(member);delivered.set(0);
  String key=UUID.randomUUID().toString();room=rooms.saveAndFlush(Room.builder().roomName(key).capacity(5).build()).getId();sport=sports.saveAndFlush(Sport.builder().sportName(key).build()).getId();
  time=LocalDateTime.now(clock).plusHours(24);
  classId=classes.saveAndFlush(Classes.builder().className("Reminder "+key).roomId(room).sportId(sport).coachId(coach).maxCapacity(3).durationMinutes(60).scheduleTime(time).status("SCHEDULED").requiredAccessLevel("STANDARD").build()).getId();
  bookings.saveAndFlush(ClassBooking.builder().classId(classId).memberId(member).bookedAt(LocalDateTime.now(clock)).status("BOOKED").build());
  pkg=jdbc.queryForObject("SELECT TOP(1) package_id FROM membership_packages ORDER BY package_id",Integer.class);
 }
 int count(){return jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,member);}
 int subscription(int days){return jdbc.queryForObject("INSERT member_subscriptions(member_id,package_id,start_date,end_date,status) OUTPUT INSERTED.subscription_id VALUES(?,?,?,?,'ACTIVE')",Integer.class,member,pkg,LocalDate.now(clock).minusDays(10),LocalDate.now(clock).plusDays(days));}
 void schedule(LocalDateTime at){jdbc.update("UPDATE classes SET schedule_time=? WHERE class_id=?",at,classId);}
 @Test void boundaryLateBookingCancellationAndScheduleChange(){
  schedule(time.plusSeconds(1));reminders.remindClass(classId);assertEquals(0,count());
  schedule(time);reminders.remindClass(classId);reminders.remindClass(classId);assertEquals(1,count());
  String old="CLASS_REMINDER:"+classId+":"+time;
  assertTrue(eligibility.eligible(old,member));schedule(time.minusHours(2));assertFalse(eligibility.eligible(old,member));
  reminders.remindClass(classId);assertEquals(2,count());
  jdbc.update("UPDATE class_bookings SET status='CANCELLED' WHERE class_id=?",classId);
  assertFalse(eligibility.eligible("CLASS_REMINDER:"+classId+":"+time.minusHours(2),member));
  schedule(time.minusHours(3));reminders.remindClass(classId);assertEquals(2,count());
  schedule(LocalDateTime.now(clock));reminders.remindClass(classId);assertEquals(2,count());
 }
 @Test void concurrentWorkersAndRollbackAreDurable() throws Exception {
  new TransactionTemplate(tm).executeWithoutResult(s->{reminders.remindClass(classId);assertEquals(1,count());s.setRollbackOnly();});assertEquals(0,count());
  var start=new CountDownLatch(1);try(var workers=Executors.newFixedThreadPool(4)){
   var futures=new ArrayList<Future<?>>();for(int i=0;i<4;i++)futures.add(workers.submit(()->{try{start.await();reminders.remindClass(classId);}catch(InterruptedException e){throw new IllegalStateException(e);}}));
   start.countDown();for(var future:futures)future.get(20,TimeUnit.SECONDS);
  }assertEquals(1,count());assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=?",Integer.class,member));
 }
 @Test void officialLateBookingCreatesReminderAndRollbackKeepsBothAtomic(){
  subscription(7);jdbc.update("UPDATE class_bookings SET status='CANCELLED' WHERE class_id=?",classId);
  new TransactionTemplate(tm).executeWithoutResult(s->{bookingService.bookClass(classId,member);assertEquals(1,count());s.setRollbackOnly();});
  assertEquals(0,count());assertEquals("CANCELLED",bookings.findByClassIdAndMemberId(classId,member).orElseThrow().getStatus());
  bookingService.bookClass(classId,member);assertEquals(1,count());reminders.remindClass(classId);assertEquals(1,count());
 }
 @Test void schedulerUsesFiveMinuteAndVietnamNineOclockDefaults() throws Exception {
  var a=MemberNotificationJobs.class.getMethod("classes").getAnnotation(org.springframework.scheduling.annotation.Scheduled.class);
  var b=MemberNotificationJobs.class.getMethod("expiry").getAnnotation(org.springframework.scheduling.annotation.Scheduled.class);
  assertEquals("${app.me09.reminder-delay-ms:300000}",a.fixedDelayString());assertEquals("${app.me09.expiry-cron:0 0 9 * * *}",b.cron());assertEquals("Asia/Ho_Chi_Minh",b.zone());
  subscription(1);clock.now.set(LocalDate.now(clock).atTime(8,59).atZone(clock.getZone()).toInstant());
  var jobs=new MemberNotificationJobs(jdbc,reminders,clock);jobs.catchUp();assertEquals(0,count());
  clock.advance(Duration.ofMinutes(1));jobs.catchUp();assertEquals(1,count());jobs.expiry();assertEquals(1,count());
 }
 @Test void staleQueuedScheduleIsSkippedBeforeSseAndFreshSchedulePublishes(){
  reminders.remindClass(classId);schedule(time.plusDays(2));publisher.drain();assertEquals(0,delivered.get());
  assertEquals("SENT",jdbc.queryForObject("SELECT state FROM member_notification_outbox WHERE recipient_id=?",String.class,member));
  schedule(time.minusHours(2));reminders.remindClass(classId);publisher.drain();assertEquals(1,delivered.get());assertEquals(2,count());
 }
 @Test void concurrentExpiryWorkersProduceOneDurableReminder() throws Exception {
  int sub=subscription(7);var start=new CountDownLatch(1);try(var workers=Executors.newFixedThreadPool(4)){
   var futures=new ArrayList<Future<?>>();for(int i=0;i<4;i++)futures.add(workers.submit(()->{try{start.await();reminders.remindExpiry(sub);}catch(InterruptedException e){throw new IllegalStateException(e);}}));start.countDown();for(var future:futures)future.get(20,TimeUnit.SECONDS);
  }assertEquals(1,count());
 }
 @Test void d7AndD1AreIndependentAndCatchUpDoesNotReplayOldThresholds(){
  int sub=subscription(7);reminders.remindExpiry(sub);reminders.remindExpiry(sub);assertEquals(1,count());
  clock.advance(Duration.ofDays(6));reminders.remindExpiry(sub);reminders.remindExpiry(sub);assertEquals(2,count());
  clock.advance(Duration.ofDays(1));reminders.remindExpiry(sub);assertEquals(2,count());
  assertEquals("ACTIVE",jdbc.queryForObject("SELECT status FROM member_subscriptions WHERE subscription_id=?",String.class,sub));
 }
 @Test void cancelledRefundedAndInactiveMembersAreSkipped(){
  int sub=subscription(1);jdbc.update("UPDATE member_subscriptions SET status='CANCELLED' WHERE subscription_id=?",sub);reminders.remindExpiry(sub);assertEquals(0,count());
  jdbc.update("UPDATE member_subscriptions SET status='ACTIVE' WHERE subscription_id=?",sub);
  jdbc.update("INSERT invoices(subscription_id,member_id,amount,payment_method,payment_status) VALUES(?,?,100000,'CASH','REFUNDED')",sub,member);
  reminders.remindExpiry(sub);assertEquals(0,count());
  assertFalse(eligibility.validSubscription(sub,member,LocalDate.now(clock).plusDays(1)));
 }
 @Test void pendingRenewalDoesNotSuppressButConfirmedConsecutivePeriodDoes(){
  int sub=subscription(7);int next=jdbc.queryForObject("INSERT member_subscriptions(member_id,package_id,start_date,end_date,status) OUTPUT INSERTED.subscription_id VALUES(?,?,?,?,'ACTIVE')",Integer.class,member,pkg,LocalDate.now(clock).plusDays(8),LocalDate.now(clock).plusDays(17));
  String key=UUID.randomUUID().toString();
  int order=jdbc.queryForObject("INSERT membership_orders(member_id,package_id,order_kind,source_subscription_id,source_package_id,package_name_snapshot,package_price_snapshot,package_duration_days_snapshot,package_status_snapshot,payment_method,status,idempotency_key,request_fingerprint,created_by) OUTPUT INSERTED.membership_order_id VALUES(?,?,'RENEWAL',?,?,'Reminder test',100000,10,'ACTIVE','CASH','PENDING_PAYMENT',?,?,?)",Integer.class,member,pkg,sub,pkg,key,"0".repeat(64),member);
  jdbc.update("INSERT invoices(subscription_id,membership_order_id,member_id,amount,payment_method,payment_status) VALUES(?,?,?,100000,'CASH','PENDING')",next,order,member);
  reminders.remindExpiry(sub);assertEquals(1,count());
  jdbc.update("UPDATE membership_orders SET status='CONFIRMED' WHERE membership_order_id=?",order);jdbc.update("UPDATE invoices SET payment_status='PAID' WHERE membership_order_id=?",order);
  clock.advance(Duration.ofDays(6));reminders.remindExpiry(sub);assertEquals(1,count());
  assertFalse(eligibility.validSubscription(sub,member,LocalDate.now(clock).plusDays(1)));
 }
}
