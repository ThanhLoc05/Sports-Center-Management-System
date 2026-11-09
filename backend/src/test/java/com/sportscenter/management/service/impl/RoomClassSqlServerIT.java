package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.controller.RoomController;
import com.sportscenter.management.dto.Request.*;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import jakarta.persistence.EntityManager;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in only. Real repositories/transactions, no mock DB and no schema initialization. */
@EnabledIfSystemProperty(named="sportiva.room-race", matches="true")
@SpringBootTest(classes={SportsCenterApplication.class, RoomClassSqlServerIT.HookConfig.class}, properties={
    "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaRoomRace_20261109;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaRoomRaceIT",
    "spring.datasource.username=", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=validate",
    "spring.sql.init.mode=never", "spring.flyway.enabled=false", "spring.liquibase.enabled=false"})
class RoomClassSqlServerIT {
    @Autowired RoomRepository rooms; @Autowired ClassRepository classes;
    @Autowired SportRepository sports; @Autowired UserRepository users; @Autowired RoleRepository roles;
    @Autowired ClassServiceImpl service; @Autowired RoomController controller;
    @Autowired PlatformTransactionManager tm; @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;
    private TransactionTemplate tx;
    private int roomId, coachId, sportId, classId;
    private ExecutorService workers;
    static final ThreadLocal<Runnable> before = new ThreadLocal<>(), after = new ThreadLocal<>();
    @TestConfiguration static class HookConfig {
        @Bean static BeanPostProcessor roomLockObserver() {
            return new BeanPostProcessor() {
                @Override public Object postProcessAfterInitialization(Object bean, String name) {
                    if (!(bean instanceof RoomRepository)) return bean;
                    ProxyFactory proxy = new ProxyFactory(bean);
                    proxy.addAdvice((MethodInterceptor) invocation -> {
                        boolean lock = invocation.getMethod().getName().equals("findByIdForUpdate");
                        if (lock && before.get()!=null) before.get().run();
                        Object value = invocation.proceed();
                        if (lock && after.get()!=null) after.get().run();
                        return value;
                    });
                    return proxy.getProxy();
                }
            };
        }
    }
    @BeforeEach void setup() {
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaRoomRace_20261109",
                jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
        tx=new TransactionTemplate(tm); workers=Executors.newFixedThreadPool(2);
        tx.executeWithoutResult(s -> {
            String key=UUID.randomUUID().toString();
            roomId=rooms.saveAndFlush(Room.builder().roomName("race-"+key).capacity(3).build()).getId();
            sportId=sports.saveAndFlush(Sport.builder().sportName("race-"+key).build()).getId();
            coachId=users.saveAndFlush(User.builder().email(key+"@example.com").phone(key).fullName("Race fixture")
                    .passwordHash("not-a-login-credential").role(roles.findByRoleName("COACH").orElseThrow())
                    .status("ACTIVE").createdAt(LocalDateTime.now()).build()).getId();
            classId=classes.saveAndFlush(Classes.builder().className("race-existing").roomId(roomId).sportId(sportId)
                    .coachId(coachId).maxCapacity(2).scheduleTime(LocalDateTime.now().plusDays(5))
                    .durationMinutes(60).requiredAccessLevel("STANDARD").status("SCHEDULED").build()).getId();
        });
    }
    @AfterEach void teardown() { before.remove();after.remove();SecurityContextHolder.clearContext();workers.shutdownNow(); }
    private static void await(CountDownLatch latch) {
        try { assertTrue(latch.await(12,TimeUnit.SECONDS),"Latch timed out"); }
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new AssertionError(e);}
    }
    private Future<Throwable> work(Runnable action) {
        return workers.submit(() -> {
            SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("race-manager","unused","ROLE_CENTER_MANAGER"));
            try {tx.executeWithoutResult(s->action.run());return null;}
            catch(Throwable e){return e;}
            finally{before.remove();after.remove();SecurityContextHolder.clearContext();}
        });
    }
    private void shrink() { controller.updateRoom(roomId,RoomRequest.builder().roomName("race-edited-"+roomId).capacity(2).build()); }
    private void changeClass(boolean create) {
        if(create)service.createClass(ClassRequest.builder().className("race-created").sportId(sportId).coachId(coachId)
                .roomId(roomId).maxCapacity(3).durationMinutes(60).scheduleTime(LocalDateTime.now().plusDays(7)).build());
        else service.updateClass(classId,ClassRequest.builder().roomId(roomId).maxCapacity(3).build());
    }
    private void invariant() {
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM classes c JOIN rooms r ON r.room_id=c.room_id WHERE c.room_id=? AND c.status='SCHEDULED' AND c.schedule_time>SYSDATETIME() AND c.max_capacity>r.capacity",Integer.class,roomId));
    }
    private void assertSqlLockWait() throws InterruptedException {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(System.nanoTime()<deadline) {
            Integer blocked=jdbc.queryForObject("SELECT COUNT(*) FROM sys.dm_exec_requests r JOIN sys.dm_exec_sessions s ON s.session_id=r.session_id WHERE s.program_name='SportivaRoomRaceIT' AND r.wait_type LIKE 'LCK%' AND r.blocking_session_id>0",Integer.class);
            if(blocked!=null && blocked>0)return;
            Thread.sleep(25);
        }
        fail("Expected an actual SQL Server lock wait while first transaction holds room lock");
    }
    private void roomFirst(boolean create) throws Exception {
        var locked=new CountDownLatch(1);var classAttempt=new CountDownLatch(1);var release=new CountDownLatch(1);
        Future<Throwable> room=work(()->{after.set(()->{locked.countDown();await(release);});shrink();});
        await(locked);
        Future<Throwable> clazz=work(()->{before.set(classAttempt::countDown);changeClass(create);});
        try {await(classAttempt);assertSqlLockWait();assertFalse(clazz.isDone());}finally{release.countDown();}
        assertNull(room.get(20,TimeUnit.SECONDS));assertInstanceOf(IllegalArgumentException.class,clazz.get(20,TimeUnit.SECONDS));invariant();
    }
    private void classFirst(boolean create) throws Exception {
        var locked=new CountDownLatch(1);var roomAttempt=new CountDownLatch(1);var release=new CountDownLatch(1);
        Future<Throwable> clazz=work(()->{after.set(()->{locked.countDown();await(release);});changeClass(create);});
        await(locked);
        Future<Throwable> room=work(()->{before.set(roomAttempt::countDown);shrink();});
        try {await(roomAttempt);assertSqlLockWait();assertFalse(room.isDone());}finally{release.countDown();}
        assertNull(clazz.get(20,TimeUnit.SECONDS));assertInstanceOf(ResponseStatusException.class,room.get(20,TimeUnit.SECONDS));invariant();
    }
    @Test void roomLocksBeforeClassCreate() throws Exception {roomFirst(true);}
    @Test void roomLocksBeforeClassUpdate() throws Exception {roomFirst(false);}
    @Test void classCreateLocksBeforeRoom() throws Exception {classFirst(true);}
    @Test void classUpdateLocksBeforeRoom() throws Exception {classFirst(false);}
    @Test void classUpdatePreReadsRoomBeforeRoomCommitsShrink() throws Exception {
        var read=new CountDownLatch(1);var changed=new CountDownLatch(1);
        Future<Throwable> clazz=work(()->{
            assertEquals(3,rooms.findById(roomId).orElseThrow().getCapacity());
            before.set(()->{read.countDown();await(changed);});changeClass(false);
        });
        await(read);
        try {assertNull(work(this::shrink).get(20,TimeUnit.SECONDS));}finally{changed.countDown();}
        assertInstanceOf(IllegalArgumentException.class,clazz.get(20,TimeUnit.SECONDS));invariant();
    }
    @Test void classCreateWithPreloadedRoomUsesCommittedCapacity() throws Exception {
        var read=new CountDownLatch(1);var changed=new CountDownLatch(1);
        Future<Throwable> clazz=work(()->{assertEquals(3,rooms.findById(roomId).orElseThrow().getCapacity());read.countDown();await(changed);changeClass(true);});
        await(read);try {assertNull(work(this::shrink).get(20,TimeUnit.SECONDS));}finally{changed.countDown();}
        assertInstanceOf(IllegalArgumentException.class,clazz.get(20,TimeUnit.SECONDS));invariant();
    }
    @Test void pastCancelledAndCompletedClassesDoNotBlockShrink() {
        tx.executeWithoutResult(s->{
            var past=classes.findById(classId).orElseThrow();
            past.setScheduleTime(LocalDateTime.now().minusDays(1));
            past.setMaxCapacity(3);
        });
        for(String status:new String[]{"CANCELLED","COMPLETED"}) tx.executeWithoutResult(s->classes.save(Classes.builder()
                .className(status).roomId(roomId).coachId(coachId).sportId(sportId).maxCapacity(3)
                .scheduleTime(LocalDateTime.now().plusDays(8)).durationMinutes(60).requiredAccessLevel("STANDARD").status(status).build()));
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken("race-manager","unused","ROLE_CENTER_MANAGER"));
        shrink();assertEquals(2,rooms.findById(roomId).orElseThrow().getCapacity());invariant();
    }
}
