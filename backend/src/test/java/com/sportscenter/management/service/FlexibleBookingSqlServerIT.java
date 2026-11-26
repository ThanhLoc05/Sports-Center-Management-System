package com.sportscenter.management.service;

import com.sportscenter.auth.JwtService;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Request.ConfirmMembershipOrderRequest;
import com.sportscenter.management.dto.Request.MembershipOrderRequest;
import com.sportscenter.management.service.impl.MembershipOrderService;
import org.junit.jupiter.api.AfterEach;
import com.sportscenter.management.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "sportiva.flexible-db", matches = "SportivaFlexibleTest_[a-f0-9]{12}")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1", "server.shutdown=immediate",
        "spring.datasource.username=", "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=validate", "spring.sql.init.mode=never",
        "app.demo.flow4.enabled=false", "app.me09.scheduling-enabled=false",
        "app.booking.waitlist-worker-enabled=false"
})
class FlexibleBookingSqlServerIT {
    private static String catalog() {
        String name = System.getProperty("sportiva.flexible-db");
        if (name == null || !name.matches("SportivaFlexibleTest_[a-f0-9]{12}")) {
            throw new IllegalStateException("Explicit isolated flexible-booking catalog required");
        }
        return name;
    }

    @DynamicPropertySource static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlserver://DESKTOP-IKVPEK1:1433;databaseName="
                + catalog() + ";integratedSecurity=true;encrypt=true;trustServerCertificate=true");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired BookingService bookings;
    @Autowired FlexibleBookingPolicy policy;
    @Autowired RecurringClassService recurring;
    @Autowired WeeklyScheduleService weeklySchedule;
    @Autowired CoachProfileRepository coachProfiles;
    @Autowired MembershipOrderService orders;
    @Autowired MembershipService memberships;
    @Autowired JwtService jwt;
    @Autowired UserDetailsService details;
    @LocalServerPort int port;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired ClassRepository classes;
    @Autowired RoomRepository rooms;
    @Autowired SportRepository sports;
    @Autowired MembershipPackageRepository packages;
    @Autowired MemberSubscriptionRepository subscriptions;
    int sport, otherSport, room, coach;
    LocalDateTime start;

    @BeforeEach void fixtures() {
        assertEquals(catalog(), jdbc.queryForObject("SELECT DB_NAME()", String.class));
        var sportIds = sports.findAll().stream().map(Sport::getId).toList();
        sport = sportIds.get(0);
        otherSport = sportIds.get(1);
        room = rooms.saveAndFlush(Room.builder().roomName("Flexible test " + UUID.randomUUID())
                .capacity(20).build()).getId();
        coach = actor("COACH");
        start = LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(2).withNano(0);
    }

    private int actor(String role) {
        String tag = UUID.randomUUID().toString();
        return users.saveAndFlush(User.builder().email(tag + "@example.invalid").phone(tag)
                .fullName("Isolated flexible test").passwordHash("login-not-used").emailVerified(true)
                .role(roles.findByRoleName(role).orElseThrow()).status("ACTIVE").createdAt(start == null
                        ? LocalDateTime.now() : start.minusDays(2)).build()).getId();
    }

    private int member(String level, Integer sportId) {
        int id = actor("MEMBER");
        var pkg = packages.findAll().stream().filter(p -> level.equals(p.getAccessLevel())).findFirst().orElseThrow();
        subscriptions.saveAndFlush(MemberSubscription.builder().memberId(id).packageId(pkg.getId())
                .status("ACTIVE").startDate(start.minusDays(3).toLocalDate()).endDate(start.plusDays(4).toLocalDate())
                .entitlementLevel(level).selectedSportId(sportId).build());
        return id;
    }

    private int session(int sportId, int capacity, LocalDateTime time) {
        return classes.saveAndFlush(Classes.builder().className("Flexible test " + UUID.randomUUID())
                .sportId(sportId).roomId(room).coachId(coach).maxCapacity(capacity).durationMinutes(45)
                .requiredAccessLevel("STANDARD").scheduleTime(time).status("SCHEDULED").build()).getId();
    }

    @Test void batchRollsBackFirstBookingIfSecondHasWrongSport() {
        int member = member("STANDARD", sport);
        int a = session(sport, 1, start), b = session(otherSport, 1, start.plusHours(2));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> bookings.bookClasses(List.of(a,b),member));
        assertTrue(bookings.getMemberBookings(member).isEmpty());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.general_notifications WHERE recipient_id=?", Integer.class, member));
        assertEquals("BOOKED", bookings.bookClass(a, member).getStatus());
    }

    @Test void apiEnforcesMemberSportAndRoleGuards() throws Exception {
        int member = member("STANDARD", sport), target = session(otherSport, 2, start);
        assertEquals(409, post(member, "/classes/" + target + "/book", "{}"));
        assertEquals(403, post(coach, "/bookings/batch", "{\"classIds\":[" + target + "]}"));
        assertEquals(403, post(member, "/classes/" + target + "/members/" + member + "/no-show", "{}"));
        assertTrue(bookings.getMemberBookings(member).isEmpty());
    }

    private int post(int actor, String path, String body) throws Exception {
        String email = users.findById(actor).orElseThrow().getEmail();
        String token = jwt.generateToken(details.loadUserByUsername(email));
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try (var client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
        }
    }

    @Test void membershipSportAlsoAppliesToWaitlist() {
        int holder = member("VIP", null);
        int wrongSport = member("STANDARD", otherSport);
        int matchingSport = member("STANDARD", sport);
        int slot = session(sport, 1, start);
        int booking = bookings.bookClass(slot, holder).getId();

        var denied = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> policy.join(slot, wrongSport));
        assertEquals(409, denied.getStatusCode().value());
        assertTrue(policy.entries(wrongSport).isEmpty());
        assertEquals("QUEUED", policy.join(slot, matchingSport).status());
        bookings.cancelBooking(booking);
        assertEquals("INVITED", policy.entries(matchingSport).getFirst().status());
    }

    @Test void nextQueuedMemberGetsReservedSeatWhenFirstOfferExpires() {
        int holder = member("STANDARD", sport), first = member("VIP", null), second = member("VIP", null);
        int outsider = member("VIP", null), slot = session(sport,1,start);
        int booking = bookings.bookClass(slot,holder).getId();
        assertEquals("QUEUED",policy.join(slot,first).status());
        assertEquals("QUEUED",policy.join(slot,second).status());
        assertEquals(1, policy.entries(first).size());
        bookings.cancelBooking(booking);
        assertEquals("INVITED",policy.entries(first).getFirst().status());
        assertEquals("QUEUED",policy.entries(second).getFirst().status());
        assertThrows(IllegalArgumentException.class, () -> bookings.bookClass(slot,outsider));
        jdbc.update("UPDATE dbo.class_waitlist SET invite_until=? WHERE class_id=? AND member_id=?",
                policy.now().minusSeconds(1),slot,first);
        var expired = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> policy.decline(slot, first));
        assertEquals(409, expired.getStatusCode().value());
        policy.poll(slot);
        assertEquals("EXPIRED",policy.entries(first).getFirst().status());
        assertEquals("INVITED",policy.entries(second).getFirst().status());
        assertEquals("BOOKED",bookings.acceptWaitlist(slot,second).getStatus());
        assertEquals("ACCEPTED",policy.entries(second).getFirst().status());
    }

    @Test void onlyOwnerCanDeclineAndNextMemberGetsTheSeat() throws Exception {
        int holder = member("VIP", null), first = member("VIP", null), next = member("VIP", null);
        int slot = session(sport, 1, start);
        int booking = bookings.bookClass(slot, holder).getId();
        policy.join(slot, first);
        policy.join(slot, next);
        bookings.cancelBooking(booking);

        String path = "/classes/" + slot + "/waitlist/decline";
        assertEquals(403, post(coach, path, "{}"));
        assertEquals(409, post(next, path, "{}"));
        assertEquals("INVITED", policy.entries(first).getFirst().status());
        assertEquals(200, post(first, path, "{}"));
        assertEquals(409, post(first, path, "{}"));
        assertEquals("CANCELLED", policy.entries(first).getFirst().status());
        assertEquals("INVITED", policy.entries(next).getFirst().status());
        assertTrue(bookings.getMemberBookings(first).isEmpty());
        assertEquals(1, jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.member_notification_outbox
                WHERE recipient_id=? AND event_key LIKE ?
                """, Integer.class, first, "WAITLIST_DECLINED:" + slot + ":%"));
        assertEquals("BOOKED", bookings.acceptWaitlist(slot, next).getStatus());
        assertEquals(1, bookings.getClassStudents(slot).size());
    }

    @Test void acceptAndDeclineRaceCanOnlyResolveOneWay() throws Exception {
        int holder = member("VIP", null), invited = member("VIP", null), next = member("VIP", null);
        int slot = session(sport, 1, start);
        int booking = bookings.bookClass(slot, holder).getId();
        policy.join(slot, invited);
        policy.join(slot, next);
        bookings.cancelBooking(booking);
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var accept = executor.submit(() -> {
                ready.countDown();
                assertTrue(go.await(10, TimeUnit.SECONDS));
                return post(invited, "/classes/" + slot + "/waitlist/accept", "{}");
            });
            var decline = executor.submit(() -> {
                ready.countDown();
                assertTrue(go.await(10, TimeUnit.SECONDS));
                return post(invited, "/classes/" + slot + "/waitlist/decline", "{}");
            });
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            go.countDown();
            if (accept.get(20, TimeUnit.SECONDS) == 201) {
                assertEquals(409, decline.get(20, TimeUnit.SECONDS));
                assertEquals("ACCEPTED", policy.entries(invited).getFirst().status());
                assertEquals("QUEUED", policy.entries(next).getFirst().status());
            } else {
                assertEquals(409, accept.get());
                assertEquals(200, decline.get(20, TimeUnit.SECONDS));
                assertEquals("CANCELLED", policy.entries(invited).getFirst().status());
                assertTrue(bookings.getMemberBookings(invited).isEmpty());
                assertEquals("BOOKED", bookings.acceptWaitlist(slot, next).getStatus());
            }
        }
        policy.poll(slot);
        assertEquals(1, bookings.getClassStudents(slot).size());
    }

    @Test void onlyOneMemberWinsTheLastSeat() throws Exception {
        int first = member("VIP", null), second = member("VIP", null), slot = session(sport,1,start);
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        java.util.function.IntFunction<Callable<Boolean>> attempt = id -> () -> {
            ready.countDown();
            if (!go.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Race did not start");
            try { bookings.bookClass(slot,id); return true; }
            catch (IllegalArgumentException full) {
                assertTrue(full.getMessage().contains("tối đa"));
                return false;
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var a = executor.submit(attempt.apply(first));
            var b = executor.submit(attempt.apply(second));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            go.countDown();
            assertNotEquals(a.get(20, TimeUnit.SECONDS), b.get(20, TimeUnit.SECONDS));
        }
        assertEquals(1, bookings.getClassStudents(slot).size());
    }

    @Test void onlyExplicitAbsenceAndLateCancellationsCountOnce() {
        int member = member("VIP", null);
        int early = session(sport, 10, start);
        bookings.cancelBooking(bookings.bookClass(early, member).getId());
        assertEquals(0, policy.conduct(member).violations());

        var now = policy.now();
        int ended = session(sport, 10, now.minusHours(2));
        jdbc.update("INSERT dbo.class_bookings(class_id,member_id,status,booked_at) VALUES(?,?,'BOOKED',?)",
                ended, member, now.minusDays(1));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> policy.confirmNoShow(ended, member, coach));
        attendance(ended, member, "ABSENT", now);
        policy.confirmNoShow(ended, member, coach);
        policy.confirmNoShow(ended, member, coach);
        assertEquals(1, policy.conduct(member).violations());
        for (int hour : List.of(2,4)) {
            int late = session(sport, 10, now.plusHours(hour));
            bookings.cancelBooking(bookings.bookClass(late, member).getId());
        }
        assertEquals(3, policy.conduct(member).violations());
        assertEquals(2, policy.holdingLimit(member, 5));
        policy.excuse(ended, member, actor("CENTER_MANAGER"));
        assertEquals(5, policy.holdingLimit(member, 5));
    }

    @Test void onlyVipReceivesSuppliesAndRepeatedConfirmationKeepsTimestamp() {
        int vip = member("VIP", null), standard = member("STANDARD", sport), desk = actor("RECEPTIONIST");
        var now = policy.now();
        int slot = session(sport, 10, now.minusMinutes(5));
        attendance(slot, vip, "PRESENT", now);
        attendance(slot, standard, "PRESENT", now);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> policy.recordVipSupplies(slot, standard, desk, true, true));
        assertNotNull(policy.recordVipSupplies(slot, vip, desk, true, false).towelAt());
        var first = policy.recordVipSupplies(slot, vip, desk, false, true);
        assertNotNull(first.waterAt());
        assertEquals(first, policy.recordVipSupplies(slot, vip, desk, true, true));
    }

    @Test void previewReportsAnIncompatibleCoachWithoutRollingBackTheRead() {
        coachProfiles.saveAndFlush(CoachProfile.builder().user(users.findById(coach).orElseThrow())
                .specialties("Cầu lông – kỹ thuật và di chuyển").build());
        int yoga = sports.findBySportName("Yoga").orElseThrow().getId();
        var day = policy.now().toLocalDate().plusDays(20);
        String name = "Incompatible weekly preview " + UUID.randomUUID();
        var entry = new WeeklyScheduleService.Entry(name, yoga, coach, room, 6,
                Set.of(day.getDayOfWeek()), FlexibleClassSlot.SLOT_04, "STANDARD");

        var preview = weeklySchedule.preview(new WeeklyScheduleService.Request(day, 1, List.of(entry), Set.of(), null));
        assertEquals(WeeklyScheduleService.Status.CONFLICT, preview.occurrences().getFirst().status());
        assertTrue(preview.occurrences().getFirst().message().contains("Chuyên môn"));
        var rejected = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> weeklySchedule.confirm(new WeeklyScheduleService.Request(
                        day, 1, List.of(entry), Set.of(), preview.token())));
        assertEquals(409, rejected.getStatusCode().value());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM dbo.classes WHERE class_name=?", Integer.class, name));
    }

    @Test void publicationIsIdempotentAndResourceConflictLeavesNoPartialSeries() {
        var firstSlot = start.toLocalDate().atTime(15, 0);
        var request = ClassRequest.builder().className("Series " + UUID.randomUUID())
                .coachId(coach).sportId(sport).roomId(room).maxCapacity(1)
                .scheduleTime(firstSlot).durationMinutes(90).requiredAccessLevel("STANDARD").build();
        var through = firstSlot.toLocalDate().plusDays(1);
        var days = Set.of(firstSlot.getDayOfWeek(), firstSlot.plusDays(1).getDayOfWeek());
        var first = recurring.publish(request, through, days);
        assertEquals(2, first.size());
        assertEquals(first.stream().map(c -> c.getId()).toList(),
                recurring.publish(request, through, days).stream().map(c -> c.getId()).toList());
        long before = classes.count();
        request.setScheduleTime(firstSlot.minusDays(1));
        request.setClassName("Overlapping test series");
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> recurring.publish(request, through, Set.of(start.getDayOfWeek(), start.minusDays(1).getDayOfWeek())));
        assertEquals(before, classes.count());
    }

    private void attendance(int slot, int member, String status, LocalDateTime time) {
        jdbc.update("INSERT dbo.attendances(class_id,member_id,checked_in_by,checked_in_at,status) VALUES(?,?,?,?,?)",
                slot, member, coach, time, status);
    }

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test void picksSportOnceForLegacyPeriodAndDefersChangeUntilNextPeriod() {
        int member = member("STANDARD", null);
        var source = subscriptions.findActiveMembership(member).orElseThrow();
        memberships.chooseSport(member, source.getId(), sport);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> memberships.chooseSport(member, source.getId(), otherSport));
        var next = pay(member, source.getId(), "STANDARD", otherSport);
        assertEquals(source.getEndDate().plusDays(1), next.getStartDate());
        assertEquals(otherSport, next.getSelectedSportId());
        assertEquals(sport, subscriptions.findActiveMembership(member).orElseThrow().getSelectedSportId());
    }

    @Test void upgradeToVipStartsTodayAndCarriesPaidDays() {
        int member = member("STANDARD", sport);
        var source = subscriptions.findActiveMembership(member).orElseThrow();
        var next = pay(member, source.getId(), "VIP", null);
        assertEquals(policy.now().toLocalDate(), next.getStartDate());
        assertEquals("VIP", next.getEntitlementLevel());
        assertNull(next.getSelectedSportId());
        assertTrue(next.getEndDate().isAfter(source.getEndDate()));
        assertEquals("EXPIRED", subscriptions.findById(source.getId()).orElseThrow().getStatus());
    }

    @Test void downgradingToStandardLeavesCurrentVipUntilItsEnd() {
        int member = member("VIP", null);
        var source = subscriptions.findActiveMembership(member).orElseThrow();
        var next = pay(member, source.getId(), "STANDARD", sport);
        assertEquals(source.getEndDate().plusDays(1), next.getStartDate());
        assertEquals(source.getId(), subscriptions.findActiveMembership(member).orElseThrow().getId());
    }

    private com.sportscenter.management.dto.Response.MemberSubscriptionResponse pay(
            int member, int source, String level, Integer selectedSport) {
        int staff = actor("RECEPTIONIST");
        var user = users.findById(staff).orElseThrow();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                user.getEmail(), null, List.of(new SimpleGrantedAuthority("ROLE_RECEPTIONIST"))));
        var offer = packages.findAll().stream().filter(p -> level.equals(p.getAccessLevel())).findFirst().orElseThrow();
        var input = new MembershipOrderRequest();
        input.setMemberId(member);
        input.setSourceSubscriptionId(source);
        input.setPackageId(offer.getId());
        input.setSelectedSportId(selectedSport);
        input.setPaymentMethod("CASH");
        var order = orders.create(input, UUID.randomUUID().toString());
        var confirm = new ConfirmMembershipOrderRequest();
        confirm.setVersion(order.getVersion());
        return orders.confirm(order.getId(), confirm, UUID.randomUUID().toString()).getSubscription();
    }
}
