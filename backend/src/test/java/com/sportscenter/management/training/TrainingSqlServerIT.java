package com.sportscenter.management.training;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.RefundRequest;
import com.sportscenter.management.payment.*;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.ClassCompletionJobs;
import com.sportscenter.management.service.FlexibleBookingPolicy;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.sportscenter.management.training.TrainingModels.*;

/** Opt-in local SQL Server tests. Every fixture, invoice and bank event rolls back. No money is transferred. */
@EnabledIfSystemProperty(named="sportiva.training-sqlserver",matches="true")
@SpringBootTest(classes=SportsCenterApplication.class,properties={"app.course.enabled=true","app.training.scheduling-enabled=false","app.me09.scheduling-enabled=false","spring.jpa.open-in-view=false"})
@Transactional
class TrainingSqlServerIT {
    @Autowired JdbcTemplate jdbc;
    @Autowired TrainingProgramService programs;
    @Autowired TrainingAccessService access;
    @Autowired CourseOrderService orders;
    @Autowired BookingService bookings;
    @Autowired FlexibleBookingPolicy flexiblePolicy;
    @Autowired InvoiceRepository invoices;
    @Autowired BankPaymentEventRepository events;
    @MockitoSpyBean CourseFeature courseFeature;
    @MockitoBean SecurityUtils security;
    @MockitoBean JavaMailSender mail;
    @MockitoBean ClassCompletionJobs completion;
    @MockitoBean BankAccountService bank;
    int manager,coach,member,sport,otherSport,room,subscription;
    LocalDate first;
    @BeforeEach void fixtures() {
        String key="training-it-"+UUID.randomUUID();
        manager=user(key+"m","CENTER_MANAGER");coach=user(key+"c","COACH");member=user(key+"u","MEMBER");
        sport=jdbc.queryForObject("INSERT sports(sport_name) OUTPUT INSERTED.sport_id VALUES(?)",Integer.class,key);
        otherSport=jdbc.queryForObject("INSERT sports(sport_name) OUTPUT INSERTED.sport_id VALUES(?)",Integer.class,key+"other");
        room=jdbc.queryForObject("INSERT rooms(room_name,capacity) OUTPUT INSERTED.room_id VALUES(?,30)",Integer.class,key);
        int pack=jdbc.queryForObject("INSERT membership_packages(package_name,duration_days,price,access_level,sport_limit,max_concurrent_classes,course_discount_percent,status) OUTPUT INSERTED.package_id VALUES(?,90,100000,'STANDARD',1,1,0,'ACTIVE')",Integer.class,key);
        subscription=jdbc.queryForObject("INSERT member_subscriptions(member_id,package_id,start_date,end_date,status) OUTPUT INSERTED.subscription_id VALUES(?,?,?,?,'ACTIVE')",Integer.class,member,pack,access.today(),access.today().plusDays(90));
        jdbc.update("INSERT invoices(subscription_id,member_id,amount,payment_method,payment_status,paid_at) VALUES(?,?,100000,'CASH','PAID',?)",subscription,member,access.now());
        first=access.today().with(TemporalAdjusters.next(DayOfWeek.MONDAY));
        asManager();
        when(bank.requireAccount()).thenReturn(new BankAccountData("970422","MB","123456789","SPORTIVA TEST","MBBank"));
    }
    int user(String key,String role) {
        return jdbc.queryForObject("INSERT users(email,password_hash,full_name,phone,role_id,status,email_verified) OUTPUT INSERTED.user_id SELECT ?,'not-a-login',?,?,role_id,'ACTIVE',1 FROM roles WHERE role_name=?",Integer.class,key+"@example.test",key,key,role);
    }
    void asManager() {
        when(security.getCurrentUserId()).thenReturn(manager); when(security.isCenterManager()).thenReturn(true); when(security.hasRole("MEMBER")).thenReturn(false);
        when(security.isOwnerOrAuthorized(anyInt())).thenReturn(true);
    }
    void asMember() {
        when(security.getCurrentUserId()).thenReturn(member); when(security.isCenterManager()).thenReturn(false);when(security.hasRole("MEMBER")).thenReturn(true);
    }
    ProgramInput input(String name,int sportId,boolean course,int hour,int...days) {
        var slots=Arrays.stream(days).mapToObj(d->new SlotInput(d,LocalTime.of(hour,0),LocalTime.of(hour+1,0),coach,room)).toList();
        return new ProgramInput(name,sportId,"Mục tiêu rõ ràng","Cơ bản",10,"STANDARD",slots,course?12:null,course?first:null,course?BigDecimal.valueOf(1000000):null,course?true:null);
    }
    Program regular(String name,int sportId,int hour,int...days) {return programs.save("REGULAR",null,input(name,sportId,false,hour,days));}
    Program course(String name,int hour) {return programs.save("COURSE",null,input(name,sport,true,hour,1,3,5));}
    void vip() {jdbc.update("UPDATE p SET access_level='VIP',sport_limit=NULL,max_concurrent_classes=2,course_discount_percent=10 FROM membership_packages p JOIN member_subscriptions s ON s.package_id=p.package_id WHERE s.subscription_id=?",subscription);}
    @Test void regularClassBindsSportOnlyOnRegistrationAndRespectsQuotaAndExpiry() {
        var one=regular("Three days",sport,7,1,3,5);var two=regular("Two days",sport,8,2,4);var other=regular("Other sport",otherSport,9,2,4);
        assertNull(one.endDate());assertEquals(3,one.slots().size());
        asMember();
        assertTrue(programs.search("REGULAR",new SearchInput(sport,null,null,null)).stream().anyMatch(p->p.id()==one.id()));
        assertTrue(access.selectedSports(access.requireAccess(member)).isEmpty());
        var reg=programs.register(one.id(),null);
        assertEquals(access.requireAccess(member).endDate(),reg.validUntil());assertEquals(List.of(sport),access.selectedSports(access.requireAccess(member)));
        assertFalse(programs.detail("REGULAR",two.id(),null).eligible());
        assertFalse(programs.detail("REGULAR",other.id(),null).eligible());
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE b.member_id=? AND c.regular_class_id=? AND CONVERT(date,c.schedule_time)>?",Integer.class,member,one.id(),reg.validUntil()));
        programs.cancelRegistration(reg.id());assertEquals(0,access.activeClassCount(access.requireAccess(member),null));
        programs.register(two.id(),null);assertEquals(1,access.activeClassCount(access.requireAccess(member),null));
    }
    @Test void vipCanHoldTwoRegularClassesAndDifferentSports() {
        vip();var one=regular("One",sport,7,1,3,5);var two=regular("Two",otherSport,8,2,4);var three=regular("Three",sport,9,1,3,5);
        asMember();programs.register(one.id(),null);programs.register(two.id(),null);
        assertEquals(2,access.activeClassCount(access.requireAccess(member),null));assertFalse(programs.detail("REGULAR",three.id(),null).eligible());
    }
    @Test void courseNeedsWholeMembershipCoverageAndDoesNotConsumeRegularQuota() {
        vip();var regular=regular("Regular",sport,7,1,3,5);var course=course("Course",8);
        asMember();programs.register(regular.id(),null);var key=UUID.randomUUID().toString();
        var order=orders.create(new CourseOrderInput(course.id(),null,"CASH"),key);
        assertEquals(900000,order.amount().intValueExact());assertEquals(order.id(),orders.create(new CourseOrderInput(course.id(),null,"CASH"),key).id());
        asManager();var confirmed=orders.confirmCash(order.id(),order.version());
        assertEquals("CONFIRMED",confirmed.status());assertEquals(12,jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE c.course_id=? AND b.member_id=? AND b.status='BOOKED'",Integer.class,course.id(),member));
        assertEquals(1,access.activeClassCount(access.requireAccess(member),null));assertEquals("PAID",confirmed.invoice().getPaymentStatus());
        assertEquals(confirmed.id(),orders.confirmCash(order.id(),order.version()).id());
        var refunded=orders.refund(confirmed.invoice().getId(),new RefundRequest("Test","CASH",confirmed.paymentReference(),BigDecimal.valueOf(900000),true));
        assertEquals("REFUNDED",refunded.getPaymentStatus());assertEquals("ACTIVE",jdbc.queryForObject("SELECT status FROM member_subscriptions WHERE subscription_id=?",String.class,subscription));
        jdbc.update("UPDATE member_subscriptions SET end_date=? WHERE subscription_id=?",first.plusDays(3),subscription);
        assertFalse(programs.detail("COURSE",course.id(),member).eligible());
    }
    @Test void flexibleBatchAndWaitlistDoNotEnrollCourseSessions() {
        var course = course("Course uses its own enrollment", 8);
        int session = jdbc.queryForObject(
                "SELECT MIN(class_id) FROM classes WHERE course_id=?", Integer.class, course.id());
        asMember();
        var batch = assertThrows(ResponseStatusException.class,
                () -> bookings.bookClasses(List.of(session), member));
        assertEquals(409, batch.getStatusCode().value());
        assertTrue(batch.getReason().contains("chương trình"));
        var waitlist = assertThrows(ResponseStatusException.class, () -> flexiblePolicy.join(session, member));
        assertEquals(409, waitlist.getStatusCode().value());
        assertTrue(waitlist.getReason().contains("linh hoạt"));
    }

    @Test void verifiedSplitBankTransfersConfirmOnceAndCashRouteCannotApproveThem() {
        vip();var course=course("Bank course",10);asMember();var order=orders.create(new CourseOrderInput(course.id(),null,"BANK_TRANSFER"),UUID.randomUUID().toString());
        var invoice=invoices.findById(order.invoice().getId()).orElseThrow();
        long base=1_000_000_000L+new Random().nextInt(100_000_000);
        var firstEvent=transfer(base,order,400000);orders.acceptBankTransfer(invoice,firstEvent);
        assertEquals("PENDING_PAYMENT",orders.detail(order.id()).status());
        var second=transfer(base+1,order,500000);orders.acceptBankTransfer(invoice,second);orders.acceptBankTransfer(invoice,second);
        assertEquals("CONFIRMED",orders.detail(order.id()).status());assertEquals(2,events.findAll().stream().filter(e->Objects.equals(e.getInvoiceId(),invoice.getId())).count());
        assertEquals(12,jdbc.queryForObject("SELECT COUNT(*) FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE c.course_id=? AND b.member_id=?",Integer.class,course.id(),member));
    }
    @Test void pausedCourseKeepsInvoicesAndVerifiedReceiptsWithoutEnrolling() {
        vip();
        var paidCourse = course("Paid before disabling", 8);
        var cashCourse = course("Pending cash", 10);
        var bankCourse = course("Pending transfer", 12);
        asMember();
        var paid = orders.create(new CourseOrderInput(paidCourse.id(), null, "CASH"), UUID.randomUUID().toString());
        var cash = orders.create(new CourseOrderInput(cashCourse.id(), null, "CASH"), UUID.randomUUID().toString());
        var bankOrder = orders.create(new CourseOrderInput(bankCourse.id(), null, "BANK_TRANSFER"), UUID.randomUUID().toString());
        asManager();
        orders.confirmCash(paid.id(), paid.version());
        int paidSession = jdbc.queryForObject("SELECT MIN(class_id) FROM classes WHERE course_id=?", Integer.class, paidCourse.id());

        doReturn(false).when(courseFeature).isEnabled();
        assertPaused(() -> programs.save("COURSE", paidCourse.id(), input("Edit", sport, true, 8, 1, 3, 5)));
        var used = assertThrows(ResponseStatusException.class, () -> programs.setStatus("COURSE", paidCourse.id(), "CANCELLED"));
        assertEquals(409,used.getStatusCode().value());
        assertTrue(used.getReason().contains("dữ liệu buổi học hoặc lịch sử"));
        assertPaused(() -> orders.create(new CourseOrderInput(cashCourse.id(), member, "CASH"), UUID.randomUUID().toString()));
        assertPaused(() -> bookings.bookClass(paidSession, member));
        assertPaused(() -> orders.confirmCash(cash.id(), cash.version()));
        assertEquals("PENDING_PAYMENT", orders.detail(cash.id()).status());
        assertEquals("CANCELLED", orders.cancel(cash.id()).status());

        var bankInvoice = invoices.findById(bankOrder.invoice().getId()).orElseThrow();
        long eventId = 1_200_000_000L + new Random().nextInt(100_000_000);
        var receipt = transfer(eventId, bankOrder, 900000);
        orders.acceptBankTransfer(bankInvoice, receipt);
        orders.acceptBankTransfer(bankInvoice, receipt);
        assertEquals(1, events.findAll().stream().filter(e -> e.getProviderEventId().equals(eventId)).count());
        assertEquals("RECEIVED", events.findByProviderEventId(eventId).orElseThrow().getStatus());
        assertEquals("PENDING", orders.detail(bankOrder.id()).invoice().getPaymentStatus());
        assertPaused(() -> orders.reconcile(bankOrder.id()));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM class_bookings b JOIN classes c ON c.class_id=b.class_id WHERE c.course_id=? AND b.member_id=?",
                Integer.class, bankCourse.id(), member));

        assertEquals("PAID", orders.detail(paid.id()).invoice().getPaymentStatus());
        assertEquals("REFUNDED", orders.refund(paid.invoice().getId(),
                new RefundRequest("Test", "CASH", paid.paymentReference(), BigDecimal.valueOf(900000), true)).getPaymentStatus());
        assertEquals("ACTIVE", jdbc.queryForObject("SELECT status FROM member_subscriptions WHERE subscription_id=?", String.class, subscription));

        doReturn(true).when(courseFeature).isEnabled();
        assertEquals("CONFIRMED", orders.reconcile(bankOrder.id()).status());
        assertEquals("APPLIED", jdbc.queryForObject("SELECT status FROM bank_payment_events WHERE provider_event_id=?", String.class, eventId));
    }

    @Test void pausedCancellationValidatesWholeBatchAndReleasesResourcesWithoutDeletingHistory() {
        var first = course("Unused badminton batch", 8);
        var second = course("Course with workout history", 10);
        var third = course("Unused final course", 12);
        int secondSession = jdbc.queryForObject(
                "SELECT MIN(class_id) FROM classes WHERE course_id=?",Integer.class,second.id());
        jdbc.update("INSERT dbo.workout_plans(title,coach_id,class_id,description) VALUES(?,?,?,?)",
                "Existing plan",coach,secondSession,"Keep this training history");
        doReturn(false).when(courseFeature).isEnabled();

        var blocked = assertThrows(ResponseStatusException.class, () -> programs.cancelPausedCourses(
                new CancelCoursesInput(List.of(first.id(),second.id(),third.id()),36)));
        assertEquals(409,blocked.getStatusCode().value());
        assertEquals("OPEN",programs.data("COURSE",first.id()).status());
        assertEquals("OPEN",programs.data("COURSE",third.id()).status());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.workout_plans WHERE class_id=?",Integer.class,secondSession));

        var changed = assertThrows(ResponseStatusException.class, () -> programs.cancelPausedCourses(
                new CancelCoursesInput(List.of(first.id(),third.id()),25)));
        assertEquals(409,changed.getStatusCode().value());
        assertEquals("OPEN",programs.data("COURSE",first.id()).status());

        var start = first.startDate().atTime(8,0);
        assertThrows(ResponseStatusException.class, () ->
                programs.requireResourceFree(start,start.plusHours(1),coach,room,null,null,null));
        asMember();
        var denied = assertThrows(ResponseStatusException.class, () ->
                programs.cancelPausedCourses(new CancelCoursesInput(List.of(first.id(),third.id()),24)));
        assertEquals(403,denied.getStatusCode().value());

        asManager();
        var cancelled = programs.cancelPausedCourses(new CancelCoursesInput(List.of(first.id(),third.id()),24));
        assertEquals(List.of("CANCELLED","CANCELLED"),cancelled.stream().map(Program::status).toList());
        assertEquals(24,jdbc.queryForObject(
                "SELECT COUNT(*) FROM dbo.classes WHERE course_id IN (?,?) AND status='CANCELLED' AND program_suspended=1",
                Integer.class,first.id(),third.id()));
        assertEquals(6,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.training_slots WHERE course_id IN (?,?)",
                Integer.class,first.id(),third.id()));
        assertDoesNotThrow(() -> programs.requireResourceFree(start,start.plusHours(1),coach,room,null,null,null));
    }

    private static void assertPaused(org.junit.jupiter.api.function.Executable call) {
        var rejection = assertThrows(ResponseStatusException.class, call);
        assertEquals(409, rejection.getStatusCode().value());
        assertTrue(rejection.getReason().contains("đang tạm ngừng"));
    }

    SepayWebhookRequest transfer(long id,CourseOrder order,int amount) {
        return new SepayWebhookRequest(id,"MBBank",access.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),"123456789",order.paymentReference(),"in",BigDecimal.valueOf(amount),"TEST-"+id);
    }
}
