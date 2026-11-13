package com.sportscenter.management.service;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/** Opt-in real HTTP/SQL tests. Never loads application-local configuration or sends mail. */
@EnabledIfSystemProperty(named = "sportiva.attendance-sql", matches = "true")
@Execution(ExecutionMode.SAME_THREAD)
@SpringBootTest(classes = {SportsCenterApplication.class, AttendanceMergeSqlServerIT.TestClock.class},
        webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT, properties = {
        "server.port=8082", "server.address=127.0.0.1", "server.shutdown=immediate",
        "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaAttendanceMerge_20261112;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaAttendanceMergeIT",
        "spring.datasource.username=", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never", "spring.flyway.enabled=false", "spring.liquibase.enabled=false",
        "app.me09.scheduling-enabled=false", "spring.jpa.open-in-view=false",
        "logging.level.root=WARN", "logging.level.org.springframework.web=OFF", "logging.level.org.hibernate.SQL=OFF"
})
class AttendanceMergeSqlServerIT {
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    @TestConfiguration static class TestClock {
        @Bean @Primary MutableClock attendanceTestClock() { return new MutableClock(); }
    }
    static final class MutableClock extends Clock {
        private final AtomicReference<Instant> instant;
        private final ZoneId zone;
        MutableClock() { this(new AtomicReference<>(Instant.now()), VIETNAM); }
        private MutableClock(AtomicReference<Instant> instant, ZoneId zone) { this.instant = instant; this.zone = zone; }
        void at(LocalDateTime value) { instant.set(value.atZone(VIETNAM).toInstant()); }
        void at(Instant value) { instant.set(value); }
        @Override public ZoneId getZone() { return zone; }
        @Override public Clock withZone(ZoneId zone) { return new MutableClock(instant, zone); }
        @Override public Instant instant() { return instant.get(); }
    }
    // No automatic status changes to unrelated fixtures during controlled Clock tests.
    @MockitoBean ClassCompletionJobs completionJob;
    @MockitoBean JavaMailSender mail;
    @Autowired MutableClock clock;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired RoomRepository rooms;
    @Autowired ClassRepository classes;
    @Autowired ClassBookingRepository bookings;
    @Autowired AttendanceRepository attendances;
    @Autowired PasswordEncoder encoder;
    final HttpClient http = HttpClient.newHttpClient();
    record Actor(int id, String email, String password, String role, String token) { }
    Actor member, coach, otherCoach, receptionist;
    int sport, room;

    @BeforeEach void fixtures() throws Exception {
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaAttendanceMerge_20261112",
                jdbc.queryForObject("SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))+'|'+DB_NAME()", String.class));
        clock.at(Instant.now());
        member = actor("MEMBER"); coach = actor("COACH"); otherCoach = actor("COACH"); receptionist = actor("RECEPTIONIST");
        sport = jdbc.queryForObject("SELECT TOP(1) sport_id FROM sports ORDER BY sport_id", Integer.class);
        room = rooms.saveAndFlush(Room.builder().roomName("Attendance merge " + UUID.randomUUID()).capacity(10).build()).getId();
    }
    private Actor actor(String role) throws Exception {
        String key = UUID.randomUUID().toString().replace("-", ""), password = UUID.randomUUID() + "A1";
        User user = users.saveAndFlush(User.builder().email(key + "@example.com").phone(key)
                .fullName("Isolated " + role).passwordHash(encoder.encode(password)).emailVerified(true)
                .status("ACTIVE").role(roles.findByRoleName(role).orElseThrow()).createdAt(LocalDateTime.now(clock)).build());
        var response = call(null, "POST", "/users/login", "{\"email\":\"" + user.getEmail() + "\",\"password\":\"" + password + "\"}");
        assertEquals(200, response.statusCode());
        return new Actor(user.getId(), user.getEmail(), password, role, JsonPath.read(response.body(), "$.token"));
    }
    private Classes clazz(LocalDateTime start, String status, String name) {
        Classes value = classes.saveAndFlush(Classes.builder().className(name).sportId(sport).roomId(room)
                .coachId(coach.id()).scheduleTime(start).durationMinutes(60).maxCapacity(10)
                .requiredAccessLevel("STANDARD").status(status).build());
        bookings.saveAndFlush(ClassBooking.builder().classId(value.getId()).memberId(member.id())
                .bookedAt(LocalDateTime.now(clock)).status("BOOKED").build());
        return value;
    }
    private HttpResponse<String> call(Actor actor, String method, String path, String body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:8082/api/v1" + path)).timeout(Duration.ofSeconds(20));
        if (actor != null) builder.header("Authorization", "Bearer " + actor.token());
        if (body != null) builder.header("Content-Type", "application/json");
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> checkIn(Actor actor, Classes clazz, String status) throws Exception {
        return call(actor, "POST", "/attendance", "{\"classId\":" + clazz.getId() + ",\"memberId\":" + member.id() + ",\"status\":\"" + status + "\"}");
    }
    private Attendance absence(Classes clazz) {
        return attendances.saveAndFlush(Attendance.builder().classId(clazz.getId()).memberId(member.id())
                .checkedInBy(receptionist.id()).checkedInAt(clazz.getScheduleTime()).status("ABSENT").build());
    }

    @ParameterizedTest @ValueSource(strings = {"COACH", "RECEPTIONIST"})
    void checkInBeforeDuringAfterWindowUsesVietnamTimeAndPersistsOnlyAcceptedRequests(String role) throws Exception {
        Actor actor = role.equals("COACH") ? coach : receptionist;
        LocalDateTime start = LocalDateTime.of(2026, 11, 13, 10, 0);
        for (int offset : new int[]{-901, -900, 0, 7200, 7201}) {
            Classes clazz = clazz(start, offset >= 3600 ? "COMPLETED" : "SCHEDULED", "Window " + offset);
            clock.at(start.plusSeconds(offset));
            int expected = offset < -900 || offset > 7200 ? 400 : 201;
            var response = checkIn(actor, clazz, "PRESENT");
            assertEquals(expected, response.statusCode(), role + " offset=" + offset);
            var saved = attendances.findByClassIdAndMemberId(clazz.getId(), member.id());
            assertEquals(expected == 201, saved.isPresent());
            if (saved.isPresent()) assertEquals(start.plusSeconds(offset), saved.get().getCheckedInAt());
        }
    }

    @ParameterizedTest @ValueSource(ints = {-901, -900, 0, 7200, 7201})
    void makeUpBoundaryPreservesOneRecordAndDoesNotUpdateOnRejectedRequest(int offset) throws Exception {
        LocalDateTime start = LocalDateTime.of(2026, 11, 13, 10, 0);
        Classes clazz = clazz(start, offset >= 3600 ? "COMPLETED" : "SCHEDULED", "Make-up " + offset);
        Attendance saved = absence(clazz);
        clock.at(start.plusSeconds(offset));
        int expected = offset < -900 || offset > 7200 ? 400 : 200;
        assertEquals(expected, call(coach, "PATCH", "/attendance/" + saved.getId() + "/make-up", null).statusCode());
        assertEquals(expected == 200 ? "PRESENT" : "ABSENT", attendances.findById(saved.getId()).orElseThrow().getStatus());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM attendances WHERE class_id=? AND member_id=?", Integer.class, clazz.getId(), member.id()));
    }

    @Test void makeupOwnershipAndCancelledBookingRemainEnforced() throws Exception {
        Classes clazz = clazz(LocalDateTime.now(clock), "SCHEDULED", "Ownership");
        Attendance saved = absence(clazz);
        for (Actor actor : List.of(otherCoach, receptionist, member))
            assertEquals(403, call(actor, "PATCH", "/attendance/" + saved.getId() + "/make-up", null).statusCode());
        assertEquals("ABSENT", attendances.findById(saved.getId()).orElseThrow().getStatus());
        assertEquals(403, checkIn(otherCoach, clazz, "PRESENT").statusCode());
        assertEquals(403, checkIn(member, clazz, "PRESENT").statusCode());
        assertEquals(200, call(coach, "PATCH", "/attendance/" + saved.getId() + "/make-up", null).statusCode());
        assertEquals(400, call(coach, "PATCH", "/attendance/" + saved.getId() + "/make-up", null).statusCode());
        Classes cancelled = clazz(LocalDateTime.now(clock), "SCHEDULED", "Cancelled booking");
        Attendance other = absence(cancelled);
        var booking = bookings.findByClassIdAndMemberId(cancelled.getId(), member.id()).orElseThrow();
        booking.setStatus("CANCELLED"); bookings.saveAndFlush(booking);
        assertEquals(400, call(coach, "PATCH", "/attendance/" + other.getId() + "/make-up", null).statusCode());
        assertEquals("ABSENT", attendances.findById(other.getId()).orElseThrow().getStatus());
    }

    @Test void midnightUtcInstantIsRecordedAsVietnamLocalTime() throws Exception {
        Classes clazz = clazz(LocalDateTime.of(2026, 11, 13, 0, 5), "SCHEDULED", "Midnight Vietnam");
        clock.at(Instant.parse("2026-11-12T17:00:00Z"));
        assertEquals(VIETNAM, clock.getZone());
        assertEquals(201, checkIn(coach, clazz, "PRESENT").statusCode());
        assertEquals(LocalDateTime.of(2026, 11, 13, 0, 0), attendances.findByClassIdAndMemberId(clazz.getId(), member.id()).orElseThrow().getCheckedInAt());
    }

    @Test @EnabledIfSystemProperty(named = "sportiva.attendance-chrome", matches = "true")
    void chromeNamesAndAttendanceWindowsTogether() throws Exception {
        LocalDateTime now = LocalDateTime.now(clock);
        Classes open = clazz(now.plusMinutes(5), "SCHEDULED", "Browser isolated fixture");
        Classes closed = clazz(now.plusHours(2), "SCHEDULED", "Browser outside window");
        Classes grace = clazz(now.minusMinutes(90), "COMPLETED", "Browser completed grace");
        Classes receptionOpen = clazz(now.plusMinutes(6), "SCHEDULED", "Browser receptionist check-in");
        Attendance saved = absence(grace);
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        if (!Files.isRegularFile(root.resolve("package.json"))) root = root.getParent();
        Path script = root.resolve("scripts/tests/attendance-merge.mjs");
        assertTrue(Files.isRegularFile(script));
        StringJoiner accounts = new StringJoiner(",", "[", "]");
        for (Actor actor : List.of(member, coach, otherCoach, receptionist))
            accounts.add("{\"id\":" + actor.id() + ",\"email\":\"" + actor.email() + "\",\"password\":\"" + actor.password() + "\",\"role\":\"" + (actor == otherCoach ? "OTHER_COACH" : actor.role()) + "\"}");
        var builder = new ProcessBuilder("node", script.toString());
        builder.environment().put("SPORTIVA_ATTENDANCE_ACCOUNTS", accounts.toString());
        builder.environment().put("SPORTIVA_ATTENDANCE_FIXTURES", "{\"open\":" + open.getId() + ",\"closed\":" + closed.getId() + ",\"grace\":" + grace.getId() + ",\"graceAttendance\":" + saved.getId() + ",\"receptionOpen\":" + receptionOpen.getId() + "}");
        builder.environment().put("SPORTIVA_TEST_EVIDENCE_ROOT", System.getProperty("sportiva.evidence-dir", System.getProperty("java.io.tmpdir")));
        Path log = Files.createTempFile("sportiva-attendance-merge-", ".log");
        builder.redirectErrorStream(true).redirectOutput(log.toFile());
        Process process = builder.start();
        assertTrue(process.waitFor(150, TimeUnit.SECONDS), "Isolated Chrome timed out");
        System.out.println("ATTENDANCE_MERGE_CHROME_LOG=" + log);
        assertEquals(0, process.exitValue(), "Inspect Chrome evidence; no credential values are printed");
        assertEquals("PRESENT", attendances.findById(saved.getId()).orElseThrow().getStatus());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM attendances WHERE class_id=? AND member_id=?", Integer.class, grace.getId(), member.id()));
        var receptionAttendance = attendances.findByClassIdAndMemberId(receptionOpen.getId(), member.id()).orElseThrow();
        assertEquals("PRESENT", receptionAttendance.getStatus());
        assertEquals(receptionist.id(), receptionAttendance.getCheckedInBy());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM attendances WHERE class_id=? AND member_id=?", Integer.class, closed.getId(), member.id()));
    }
}
