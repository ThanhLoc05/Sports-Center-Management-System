package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.controller.ClassController;
import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="sportiva.me09-sqlserver",matches="true")
@SpringBootTest(classes=SportsCenterApplication.class,properties={
        "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaME09_20261110;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=ME09ClassIT",
        "spring.datasource.username=","spring.datasource.password=","spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never","app.me09.scheduling-enabled=false","spring.jpa.show-sql=false"})
class Me09ClassNotificationSqlServerIT {
    @Autowired JdbcTemplate jdbc;@Autowired ClassController controller;@Autowired ClassRepository classes;
    @Autowired RoomRepository rooms;@Autowired SportRepository sports;@Autowired UserRepository users;
    @Autowired RoleRepository roles;@Autowired ClassBookingRepository bookings;@Autowired PlatformTransactionManager tm;
    int member,cancelledMember,coach,otherCoach,room,otherRoom,sport,classId;String managerEmail;
    LocalDateTime oldTime;
    int actor(String role){String key=UUID.randomUUID().toString();var u=users.saveAndFlush(User.builder().email(key+"@example.test").phone(key).fullName(role+" test "+key).passwordHash("not-a-login-credential").role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build());if(role.equals("CENTER_MANAGER"))managerEmail=u.getEmail();return u.getId();}
    @BeforeEach void setup(){
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaME09_20261110",jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
        actor("CENTER_MANAGER");member=actor("MEMBER");cancelledMember=actor("MEMBER");coach=actor("COACH");otherCoach=actor("COACH");
        String key=UUID.randomUUID().toString();room=rooms.saveAndFlush(Room.builder().roomName("old-"+key).capacity(5).build()).getId();otherRoom=rooms.saveAndFlush(Room.builder().roomName("new-"+key).capacity(5).build()).getId();
        sport=sports.saveAndFlush(Sport.builder().sportName("sport-"+key).build()).getId();oldTime=LocalDateTime.now().plusDays(5).withHour(10).withMinute(0).withSecond(0).withNano(0);
        classId=classes.saveAndFlush(Classes.builder().className("ME09 Class "+key).coachId(coach).sportId(sport).roomId(room).maxCapacity(3).scheduleTime(oldTime).durationMinutes(60).requiredAccessLevel("STANDARD").status("SCHEDULED").build()).getId();
        bookings.saveAndFlush(ClassBooking.builder().classId(classId).memberId(member).status("BOOKED").bookedAt(LocalDateTime.now()).build());
        bookings.saveAndFlush(ClassBooking.builder().classId(classId).memberId(cancelledMember).status("CANCELLED").bookedAt(LocalDateTime.now()).build());auth("CENTER_MANAGER");
    }
    void auth(String role){SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(managerEmail,"unused","ROLE_"+role));}
    @AfterEach void logout(){SecurityContextHolder.clearContext();}
    ClassRequest change(){return ClassRequest.builder().roomId(otherRoom).coachId(otherCoach).scheduleTime(oldTime.plusHours(2)).build();}
    int count(){return jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,member);}
    @Test void updateReportsOldAndNewValuesAndNoopDoesNotDuplicate(){
        controller.updateClass(classId,change());assertEquals(1,count());
        String content=jdbc.queryForObject("SELECT content FROM general_notifications WHERE recipient_id=?",String.class,member);
        assertTrue(content.contains(oldTime.toString()));assertTrue(content.contains(oldTime.plusHours(2).toString()));
        assertTrue(content.contains(rooms.findById(room).orElseThrow().getRoomName()));assertTrue(content.contains(rooms.findById(otherRoom).orElseThrow().getRoomName()));
        assertTrue(content.contains(users.findById(coach).orElseThrow().getFullName()));assertTrue(content.contains(users.findById(otherCoach).orElseThrow().getFullName()));
        controller.updateClass(classId,change());assertEquals(1,count());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,cancelledMember));
    }
    @Test void cancellationSnapshotsBookedRosterAndDoesNotRefundOrDuplicate(){
        controller.cancelClass(classId);assertEquals(1,count());
        assertEquals("CANCELLED",classes.findById(classId).orElseThrow().getStatus());
        assertEquals(0,bookings.countByClassIdAndStatus(classId,"BOOKED"));
        String content=jdbc.queryForObject("SELECT content FROM general_notifications WHERE recipient_id=?",String.class,member);
        assertTrue(content.contains(oldTime.toString()));assertTrue(content.contains("HỦY"));
        controller.cancelClass(classId);assertEquals(1,count());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id=?",Integer.class,cancelledMember));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM invoices WHERE member_id=?",Integer.class,member));
    }
    @Test void rollbackAndRoleDenialDoNotLeaveClassEvents(){
        auth("MEMBER");assertThrows(AccessDeniedException.class,()->controller.updateClass(classId,change()));assertEquals(0,count());auth("CENTER_MANAGER");
        new TransactionTemplate(tm).executeWithoutResult(s->{controller.updateClass(classId,change());assertEquals(1,count());s.setRollbackOnly();});
        assertEquals(0,count());assertEquals(oldTime,classes.findById(classId).orElseThrow().getScheduleTime());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=?",Integer.class,member));
    }
    @Test void simultaneousIdenticalUpdatesProduceOneEvent() throws Exception {
        var start=new CountDownLatch(1);
        try(var workers=Executors.newFixedThreadPool(2)){
            Callable<Void> update=()->{auth("CENTER_MANAGER");try{start.await();controller.updateClass(classId,change());return null;}finally{logout();}};
            var a=workers.submit(update);var b=workers.submit(update);start.countDown();a.get(20,TimeUnit.SECONDS);b.get(20,TimeUnit.SECONDS);
        }assertEquals(1,count());
    }
}
