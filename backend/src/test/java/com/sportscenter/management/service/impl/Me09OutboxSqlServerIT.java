package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.*;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.parallel.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.core.task.SyncTaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="sportiva.me09-sqlserver",matches="true")
@Execution(ExecutionMode.SAME_THREAD)
@SpringBootTest(classes={SportsCenterApplication.class,Me09OutboxSqlServerIT.Hooks.class},properties={
        "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaME09_20261110;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaME09IT",
        "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never","app.me09.scheduling-enabled=false","spring.jpa.show-sql=false"})
class Me09OutboxSqlServerIT {
    @Autowired JdbcTemplate jdbc; @Autowired MemberNotificationOutboxService outbox;
    @Autowired MemberNotificationPublisher publisher; @Autowired GeneralNotificationRepository history;
    @Autowired NotificationDeliveryService delivery; @Autowired UserRepository users; @Autowired RoleRepository roles;
    @Autowired PlatformTransactionManager manager; @Autowired TestClock clock;
    static final AtomicBoolean fail=new AtomicBoolean();static final AtomicInteger publications=new AtomicInteger();
    static final AtomicInteger observedRecipient=new AtomicInteger(-1);
    int sender,recipient;TransactionTemplate tx;
    static class TestClock extends Clock {
        final AtomicReference<Instant> now=new AtomicReference<>(Instant.parse("2026-11-10T02:00:00Z"));
        @Override public ZoneId getZone(){return ZoneId.of("Asia/Ho_Chi_Minh");}
        @Override public Clock withZone(ZoneId zone){return Clock.fixed(instant(),zone);}
        @Override public Instant instant(){return now.get();}
        void advance(Duration duration){now.updateAndGet(value->value.plus(duration));}
    }
    @TestConfiguration static class Hooks {
        @Bean @Primary TestClock testClock(){return new TestClock();}
        @Bean static BeanPostProcessor deliveryObserver(){return new BeanPostProcessor(){
            @Override public Object postProcessAfterInitialization(Object bean,String name){
                if(!(bean instanceof NotificationDeliveryService))return bean;
                var proxy=new ProxyFactory(bean);proxy.setProxyTargetClass(true);
                proxy.addAdvice((MethodInterceptor)call->{
                    if(call.getMethod().getName().equals("publishPersisted")
                            && ((com.sportscenter.management.entity.GeneralNotification)call.getArguments()[0]).getRecipientId()==observedRecipient.get()){
                        assertFalse(TransactionSynchronizationManager.isActualTransactionActive(),"SSE must be outside JDBC transaction");
                        publications.incrementAndGet();if(fail.get())throw new IllegalStateException("Controlled publication failure");
                    }return call.proceed();
                });return proxy.getProxy();
            }
        };}
    }
    @BeforeEach void setup(){
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaME09_20261110",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
        fail.set(false);publications.set(0);clock.now.set(Instant.parse("2026-11-10T02:00:00Z"));tx=new TransactionTemplate(manager);
        sender=actor("CENTER_MANAGER");recipient=actor("MEMBER");observedRecipient.set(recipient);
    }
    @AfterEach void reset(){fail.set(false);}
    int actor(String role){String key=UUID.randomUUID().toString();return users.saveAndFlush(User.builder()
            .email(key+"@example.test").phone(key).passwordHash("not-a-login-credential").fullName("ME09 test fixture")
            .status("ACTIVE").createdAt(LocalDateTime.now()).role(roles.findByRoleName(role).orElseThrow()).build()).getId();}
    long enqueue(String key){return outbox.enqueue(key,sender,recipient,"ME09 test","Automated test notification","/schedule");}
    void until(java.util.function.BooleanSupplier condition) throws Exception {
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
        while(!condition.getAsBoolean()){assertTrue(System.nanoTime()<end,"Outbox acknowledgement timeout");Thread.sleep(25);}
    }
    String state(long notification){return jdbc.queryForObject("SELECT state FROM member_notification_outbox WHERE notification_id=?",String.class,notification);}
    int attempts(long notification){return jdbc.queryForObject("SELECT attempts FROM member_notification_outbox WHERE notification_id=?",Integer.class,notification);}
    long eventId(long notification){return jdbc.queryForObject("SELECT id FROM member_notification_outbox WHERE notification_id=?",Long.class,notification);}
    boolean firstFailureAcknowledged(long notification){return jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE notification_id=? AND state='PENDING' AND attempts=1 AND lease_token IS NULL",Integer.class,notification)==1;}
    MemberNotificationPublisher freshWorker(){return new MemberNotificationPublisher(jdbc,history,delivery,clock,manager,new SyncTaskExecutor(),new com.sportscenter.management.service.MemberReminderEligibility(jdbc,clock));}
    @Test void concurrentEnqueueAndFreshInstancesKeepOneLogicalNotification() throws Exception {
        String key="TEST:"+UUID.randomUUID();var start=new CountDownLatch(1);var ids=new ArrayList<Future<Long>>();
        try(var workers=Executors.newFixedThreadPool(8)){
            for(int i=0;i<8;i++)ids.add(workers.submit(()->{start.await();return enqueue(key);}));start.countDown();
            var values=new HashSet<Long>();for(var id:ids)values.add(id.get(20,TimeUnit.SECONDS));assertEquals(1,values.size());
            long notification=values.iterator().next();until(()->"SENT".equals(state(notification)));
            assertEquals(1,publications.get());assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE event_key=? AND recipient_id=?",Integer.class,key,recipient));
            var fresh=new MemberNotificationOutboxService(jdbc,clock,freshWorker());
            Long duplicate=tx.execute(s->fresh.enqueue(key,sender,recipient,"Retry","Retry","/schedule"));
            assertEquals(notification,duplicate.longValue());
            freshWorker().publishOne(eventId(notification));assertEquals(1,publications.get());
            assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,recipient));
        }
    }
    @Test void rollbackRemovesBothHistoryAndOutboxAndDoesNotPublish(){
        String key="ROLLBACK:"+UUID.randomUUID();
        var inserted=new AtomicBoolean();
        assertThrows(IllegalStateException.class,()->tx.executeWithoutResult(s->{enqueue(key);inserted.set(true);throw new IllegalStateException("Controlled rollback");}));
        assertTrue(inserted.get(),"The test must reach a real insert before rollback");
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=?",Integer.class,recipient));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,recipient));assertEquals(0,publications.get());
    }
    @Test void retryBackoffIsDurableAndBoundedAcrossWorkerInstances() throws Exception {
        fail.set(true);long notification=enqueue("RETRY:"+UUID.randomUUID());until(()->firstFailureAcknowledged(notification));
        assertEquals(1,publications.get());freshWorker().publishOne(eventId(notification));assertEquals(1,publications.get());
        for(int minutes:new int[]{1,5,15}){clock.advance(Duration.ofMinutes(minutes));freshWorker().publishOne(eventId(notification));}
        assertEquals("FAILED",state(notification));assertEquals(4,publications.get());
        clock.advance(Duration.ofDays(1));freshWorker().publishOne(eventId(notification));assertEquals(4,publications.get());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,recipient));
    }
    @Test void expiredLeaseCanBeRecoveredWithoutAnotherGeneralAndLegacyRowsRemainUntouched() throws Exception {
        var date=LocalDateTime.of(2026,1,1,9,0);
        Long legacy=jdbc.queryForObject("INSERT general_notifications(sender_id,recipient_id,title,content,created_at,read_at) OUTPUT INSERTED.id VALUES(?,?,'legacy','legacy',?,?)",Long.class,sender,recipient,date,date);
        fail.set(true);long notification=enqueue("LEASE:"+UUID.randomUUID());until(()->firstFailureAcknowledged(notification));
        jdbc.update("UPDATE member_notification_outbox SET state='SENDING',lease_token='abandoned',lease_until=? WHERE notification_id=?",LocalDateTime.now(clock).minusMinutes(1),notification);
        fail.set(false);freshWorker().publishOne(eventId(notification));assertEquals("SENT",state(notification));
        assertEquals(date,history.findById(legacy).orElseThrow().getReadAt());
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,recipient));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1",Integer.class));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM sys.key_constraints WHERE name='UQ_member_outbox_event_recipient'",Integer.class));
    }
}
