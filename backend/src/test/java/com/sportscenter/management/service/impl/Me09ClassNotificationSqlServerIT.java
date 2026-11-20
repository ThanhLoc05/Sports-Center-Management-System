package com.sportscenter.management.service.impl;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.controller.ClassController;
import com.sportscenter.management.controller.ApiExceptionHandler;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import com.sportscenter.management.service.BookingService;
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
    private static String isolatedCatalog() {
        String catalog = System.getProperty("sportiva.flow2-test-db", "SportivaME09_20261110");
        if (!catalog.equals("SportivaME09_20261110") && !catalog.equals("SportivaFlow2Fix_20261113")
                && !catalog.matches("SportivaFlow2QA_[0-9]+"))
            throw new IllegalArgumentException("Only the explicitly isolated Flow 2 test database is allowed");
        return catalog;
    }
    @org.springframework.test.context.DynamicPropertySource
    static void isolatedDataSource(org.springframework.test.context.DynamicPropertyRegistry registry) {
        String catalog = isolatedCatalog();
        registry.add("spring.datasource.url", () -> "jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=" + catalog + ";integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=Flow2RegressionIT");
        registry.add("app.me09.scheduling-enabled", () -> "false");
    }

    @Autowired BookingService bookingService;
    @Autowired JdbcTemplate jdbc;@Autowired ClassController controller;@Autowired ClassRepository classes;
    @Autowired RoomRepository rooms;@Autowired SportRepository sports;@Autowired UserRepository users;
    @Autowired RoleRepository roles;@Autowired ClassBookingRepository bookings;@Autowired PlatformTransactionManager tm;
    int member,cancelledMember,coach,otherCoach,room,otherRoom,sport,classId;String managerEmail;
    LocalDateTime oldTime;
    int actor(String role){String key=UUID.randomUUID().toString();var u=users.saveAndFlush(User.builder().email(key+"@example.test").phone(key).fullName(role+" test "+key).passwordHash("not-a-login-credential").role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(LocalDateTime.now()).build());if(role.equals("CENTER_MANAGER"))managerEmail=u.getEmail();return u.getId();}
    @BeforeEach void setup(){
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|" + isolatedCatalog(),jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()",String.class));
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
    private int otherClass(LocalDateTime time, String status) {
        return classes.saveAndFlush(Classes.builder().className("Other " + UUID.randomUUID())
                .coachId(otherCoach).roomId(otherRoom).sportId(sport).scheduleTime(time)
                .durationMinutes(60).maxCapacity(5).requiredAccessLevel("STANDARD").status(status).build()).getId();
    }

    private void book(int targetClass, int memberId, String status) {
        bookings.saveAndFlush(ClassBooking.builder().classId(targetClass).memberId(memberId)
                .status(status).bookedAt(LocalDateTime.now()).build());
    }

    @Test void overlappingMoveReturns409AndPreservesClassRosterAndNotifications() throws Exception {
        int other = otherClass(oldTime.plusHours(2), "SCHEDULED");
        int secondMember = actor("MEMBER");
        book(classId, secondMember, "BOOKED");
        book(other, secondMember, "BOOKED");
        var rosterBefore = jdbc.queryForList(
                "SELECT * FROM class_bookings WHERE class_id IN (?, ?) ORDER BY booking_id", classId, other);
        int thirdCoach = actor("COACH");
        int thirdRoom = rooms.saveAndFlush(Room.builder().roomName("third-" + UUID.randomUUID()).capacity(5).build()).getId();
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiExceptionHandler()).build();

        mvc.perform(put("/api/v1/classes/{id}", classId).contentType("application/json")
                        .content("""
                                {"className":"Requested name","scheduleTime":"%s","durationMinutes":60,"coachId":%d,"roomId":%d}
                                """.formatted(oldTime.plusMinutes(90), thirdCoach, thirdRoom)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("học viên")));

        var unchanged = classes.findById(classId).orElseThrow();
        assertEquals(oldTime, unchanged.getScheduleTime());
        assertEquals(coach, unchanged.getCoachId());
        assertEquals(room, unchanged.getRoomId());
        assertTrue(unchanged.getClassName().startsWith("ME09 Class "));
        assertEquals(rosterBefore, jdbc.queryForList(
                "SELECT * FROM class_bookings WHERE class_id IN (?, ?) ORDER BY booking_id", classId, other));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM general_notifications WHERE recipient_id IN (?, ?, ?)",
                Integer.class, member, secondMember, cancelledMember));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id IN (?, ?, ?)",
                Integer.class, member, secondMember, cancelledMember));
    }

    @Test void extendingDurationConflictsButTouchingEndpointsAndInactiveBookingsDoNot() {
        book(otherClass(oldTime.plusHours(2), "SCHEDULED"), member, "BOOKED");
        book(otherClass(oldTime.plusMinutes(70), "CANCELLED"), member, "BOOKED");
        book(otherClass(oldTime.plusMinutes(70), "COMPLETED"), member, "BOOKED");
        int adjacentClass = otherClass(oldTime.plusHours(1), "SCHEDULED");
        book(adjacentClass, member, "CANCELLED");
        book(adjacentClass, cancelledMember, "BOOKED");

        var conflict = assertThrows(ResponseStatusException.class, () ->
                controller.updateClass(classId, ClassRequest.builder().durationMinutes(121).build()));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(60, classes.findById(classId).orElseThrow().getDurationMinutes());
        assertEquals(0, count());

        var moved = controller.updateClass(classId, ClassRequest.builder().scheduleTime(oldTime.plusHours(1)).build());
        assertEquals(oldTime.plusHours(1), moved.getScheduleTime());
        assertEquals(1, count());
    }

    private int move(int target, LocalDateTime time) {
        auth("CENTER_MANAGER");
        try {
            controller.updateClass(target, ClassRequest.builder().scheduleTime(time).build());
            return 200;
        } catch (ResponseStatusException e) {
            assertEquals(409, e.getStatusCode().value());
            assertTrue(e.getReason().contains("học viên"));
            return 409;
        } finally {
            logout();
        }
    }

    private List<Integer> concurrently(Callable<Integer> first, Callable<Integer> second) throws Exception {
        var start = new CyclicBarrier(2);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var left = workers.submit(() -> { start.await(10, TimeUnit.SECONDS); return first.call(); });
            var right = workers.submit(() -> { start.await(10, TimeUnit.SECONDS); return second.call(); });
            return List.of(left.get(20, TimeUnit.SECONDS), right.get(20, TimeUnit.SECONDS));
        }
    }

    @Test void twoMovesSharingAMemberCannotBothCommitOverlappingIntervals() throws Exception {
        int other = otherClass(oldTime.plusHours(2), "SCHEDULED");
        book(other, member, "BOOKED");

        var results = concurrently(() -> move(classId, oldTime.plusHours(4)),
                () -> move(other, oldTime.plusHours(4).plusMinutes(15)));

        assertTrue(results.containsAll(List.of(200, 409)), results.toString());
        assertEquals(1, count());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings WHERE member_id=? AND status='BOOKED'",
                Integer.class, member));
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void bookingAndMoveCannotBothCommitOverlappingIntervals(boolean joiningMovingClass) throws Exception {
        int other = otherClass(oldTime.plusHours(2), "SCHEDULED");
        int joiningMember = joiningMovingClass ? cancelledMember : member;
        int bookingTarget = joiningMovingClass ? classId : other;
        if (joiningMovingClass) book(other, joiningMember, "BOOKED");
        jdbc.update("""
                INSERT INTO member_subscriptions(member_id,package_id,start_date,end_date,status)
                SELECT TOP (1) ?,package_id,CAST(GETDATE() AS date),DATEADD(day,20,CAST(GETDATE() AS date)),'ACTIVE'
                FROM membership_packages WHERE access_level='STANDARD' AND status='ACTIVE' ORDER BY package_id
                """, joiningMember);

        var results = concurrently(() -> move(classId, oldTime.plusMinutes(90)), () -> {
            try {
                bookingService.bookClass(bookingTarget, joiningMember);
                return 201;
            } catch (IllegalArgumentException e) {
                assertTrue(e.getMessage().contains("trùng lịch"), e.getMessage());
                return 400;
            }
        });

        assertTrue(results.equals(List.of(200, 400)) || results.equals(List.of(409, 201)), results.toString());
        boolean moved = results.getFirst() == 200;
        assertEquals(moved ? oldTime.plusMinutes(90) : oldTime, classes.findById(classId).orElseThrow().getScheduleTime());
        assertEquals(moved ? 1 : 2, jdbc.queryForObject(
                "SELECT COUNT(*) FROM class_bookings WHERE member_id=? AND status='BOOKED'", Integer.class, joiningMember));
        assertEquals(moved ? 1 : 0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=? AND event_key LIKE 'CLASS_CHANGED:%'",
                Integer.class, member));
        assertEquals(moved ? 0 : 1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM member_notification_outbox WHERE recipient_id=? AND event_key LIKE 'BOOKING_CONFIRMED:%'",
                Integer.class, joiningMember));
    }

    @Test void simultaneousIdenticalUpdatesProduceOneEvent() throws Exception {
        var start=new CountDownLatch(1);
        try(var workers=Executors.newFixedThreadPool(2)){
            Callable<Void> update=()->{auth("CENTER_MANAGER");try{start.await();controller.updateClass(classId,change());return null;}finally{logout();}};
            var a=workers.submit(update);var b=workers.submit(update);start.countDown();a.get(20,TimeUnit.SECONDS);b.get(20,TimeUnit.SECONDS);
        }assertEquals(1,count());
    }
}
