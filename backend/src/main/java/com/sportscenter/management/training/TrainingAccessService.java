package com.sportscenter.management.training;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Classes;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.*;

@Service @RequiredArgsConstructor
public class TrainingAccessService {
    private final JdbcTemplate jdbc;
    private final SecurityUtils security;
    private final TrainingLock trainingLock;
    private final Clock clock;

    public record Access(int memberId, int subscriptionId, LocalDate startDate, LocalDate endDate,
            String level, Integer sportLimit, int maxClasses, int discountPercent) {}

    public LocalDateTime now() { return LocalDateTime.now(clock); }
    public LocalDate today() { return now().toLocalDate(); }
    public void lock() { trainingLock.acquire(); }

    public Integer selectedMember(Integer requested) {
        Integer actor=security.getCurrentUserId();
        if(actor==null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if(security.hasRole("MEMBER")) {
            if(requested!=null && !actor.equals(requested)) throw forbidden();
            return actor;
        }
        if(requested!=null && !security.isCenterManager() && !security.isReceptionist()) throw forbidden();
        return requested;
    }

    public int requireMember(Integer requested) {
        Integer member=selectedMember(requested);
        if(member==null) throw new IllegalArgumentException("Chọn thành viên cần đăng ký");
        return member;
    }

    public void lockMember(int member) {
        var rows=jdbc.queryForList("SELECT u.user_id FROM users u WITH(UPDLOCK,HOLDLOCK) JOIN roles r ON r.role_id=u.role_id WHERE u.user_id=? AND u.status='ACTIVE' AND r.role_name='MEMBER'",member);
        if(rows.size()!=1) throw new IllegalArgumentException("Thành viên không tồn tại hoặc không hoạt động");
    }

    public Optional<Access> findAccess(int member) {
        var rows=jdbc.query("""
                SELECT TOP(1) ms.subscription_id,ms.start_date,ms.end_date,
                    COALESCE(ms.entitlement_level,o.package_access_level_snapshot,p.access_level) AS access_level,
                    CASE WHEN COALESCE(ms.entitlement_level,o.package_access_level_snapshot,p.access_level)='VIP' THEN NULL ELSE 1 END AS sport_limit,
                    COALESCE(o.max_concurrent_classes_snapshot,p.max_concurrent_classes) AS max_classes,
                    COALESCE(o.course_discount_percent_snapshot,p.course_discount_percent) AS discount_percent
                FROM member_subscriptions ms JOIN users u ON u.user_id=ms.member_id
                JOIN roles r ON r.role_id=u.role_id JOIN membership_packages p ON p.package_id=ms.package_id
                JOIN invoices i ON i.subscription_id=ms.subscription_id AND i.payment_status='PAID'
                LEFT JOIN membership_orders o ON o.membership_order_id=i.membership_order_id
                WHERE ms.member_id=? AND ms.status='ACTIVE' AND ms.start_date<=? AND ms.end_date>=?
                    AND u.status='ACTIVE' AND r.role_name='MEMBER'
                ORDER BY ms.start_date DESC,i.created_at DESC
                """,(rs,n)->new Access(member,rs.getInt("subscription_id"),rs.getDate("start_date").toLocalDate(),
                        rs.getDate("end_date").toLocalDate(),rs.getString("access_level"),(Integer)rs.getObject("sport_limit"),
                        rs.getInt("max_classes"),rs.getInt("discount_percent")),member,today(),today());
        return rows.stream().findFirst();
    }

    public Access requireAccess(int member) {
        return findAccess(member).orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,
                "Thành viên cần gói đã thanh toán và đang có hiệu lực để đăng ký"));
    }

    public List<Integer> selectedSports(Access access) {
        return jdbc.queryForList("SELECT selected_sport_id FROM member_subscriptions WHERE subscription_id=? AND selected_sport_id IS NOT NULL",Integer.class,access.subscriptionId());
    }

    public boolean sportAllowed(Access access,int sport) {
        if(access.sportLimit()==null) return true;
        var selected=selectedSports(access);
        return selected.contains(sport) || selected.size()<access.sportLimit();
    }

    public void chooseSport(Access access,int sport) {
        if(!sportAllowed(access,sport)) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Gói đã chốt đủ số bộ môn trong kỳ. Bạn có thể chọn lại khi gia hạn.");
        if (access.sportLimit() == null) return;
        jdbc.update("UPDATE member_subscriptions SET selected_sport_id=?, entitlement_level=COALESCE(entitlement_level, 'STANDARD') WHERE subscription_id=? AND selected_sport_id IS NULL", sport, access.subscriptionId());
        jdbc.update("INSERT membership_sports(subscription_id,sport_id) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM membership_sports WHERE subscription_id=? AND sport_id=?)",
                access.subscriptionId(),sport,access.subscriptionId(),sport);
    }

    public int activeClassCount(Access access,Integer excludeClass) {
        int regular=jdbc.queryForObject("""
                SELECT COUNT(DISTINCT reg.regular_class_id) FROM regular_class_registrations reg
                JOIN regular_classes c ON c.id=reg.regular_class_id JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id
                WHERE reg.member_id=? AND reg.status='ACTIVE' AND c.status='ACTIVE' AND s.status='ACTIVE'
                    AND reg.valid_until>=? AND s.end_date>=? AND reg.valid_from<=? AND s.start_date<=?
                    AND (? IS NULL OR reg.regular_class_id<>?)
                """,Integer.class,access.memberId(),today(),today(),access.endDate(),access.endDate(),excludeClass,excludeClass);
        return regular;
    }

    public void requireClassQuota(Access access,Integer excludeClass) {
        if(activeClassCount(access,excludeClass)>=access.maxClasses())
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Gói chỉ cho phép tối đa "+access.maxClasses()+" lớp thường đang đăng ký. Hãy hủy một lớp trước khi chọn lớp khác.");
    }

    public boolean registered(int regularClass,int member,LocalDate date) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM regular_class_registrations reg JOIN member_subscriptions s ON s.subscription_id=reg.subscription_id
                WHERE reg.regular_class_id=? AND reg.member_id=? AND reg.status='ACTIVE' AND s.status='ACTIVE'
                    AND reg.valid_from<=? AND reg.valid_until>=? AND s.start_date<=? AND s.end_date>=?
                """,Integer.class,regularClass,member,date,date,date,date)>0;
    }

    public void requireNoMemberConflict(int member,LocalDateTime start,LocalDateTime end,Integer excludeRegular,Integer excludeCourse,Integer excludeSession) {
        int count=jdbc.queryForObject("""
                SELECT COUNT(*) FROM class_bookings b JOIN classes c ON c.class_id=b.class_id
                WHERE b.member_id=? AND b.status='BOOKED' AND c.status='SCHEDULED'
                    AND c.schedule_time<? AND DATEADD(minute,c.duration_minutes,c.schedule_time)>?
                    AND (? IS NULL OR c.regular_class_id IS NULL OR c.regular_class_id<>?)
                    AND (? IS NULL OR c.course_id IS NULL OR c.course_id<>?) AND (? IS NULL OR c.class_id<>?)
                """,Integer.class,member,end,start,excludeRegular,excludeRegular,excludeCourse,excludeCourse,excludeSession,excludeSession);
        if(count>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Trùng lịch với một buổi đã đăng ký vào "+start.toLocalDate()+" lúc "+start.toLocalTime());
        // Pending course payments hold both the seat and its schedule until expiration.
        count=jdbc.queryForObject("""
                SELECT COUNT(*) FROM course_orders o JOIN classes c ON c.course_id=o.course_id
                WHERE o.member_id=? AND o.status='PENDING_PAYMENT' AND o.expires_at>? AND c.status='SCHEDULED'
                    AND c.schedule_time<? AND DATEADD(minute,c.duration_minutes,c.schedule_time)>?
                    AND (? IS NULL OR c.course_id<>?)
                """,Integer.class,member,now(),end,start,excludeCourse,excludeCourse);
        if(count>0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Trùng lịch với khóa học đang chờ thanh toán");
    }

    public void validateSessionBooking(Classes session,int member) {
        Access access=requireAccess(member);
        if(!TrainingPolicy.levelAllowed(access.level(),session.getRequiredAccessLevel()))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Gói không đủ cấp quyền tham gia buổi này");
        LocalDate day=session.getScheduleTime().toLocalDate();
        if(day.isBefore(access.startDate()) || day.isAfter(access.endDate()))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Buổi học nằm ngoài thời hạn gói");
        if(session.getRegularClassId()!=null) {
            if(!registered(session.getRegularClassId(),member,day))
                throw new ResponseStatusException(HttpStatus.CONFLICT,"Đăng ký lịch lớp thường trước khi tham gia các buổi của lớp");
        } else if(session.getCourseId()!=null) {
            int paid=jdbc.queryForObject("SELECT COUNT(*) FROM course_orders o JOIN courses c ON c.id=o.course_id WHERE o.course_id=? AND o.member_id=? AND o.status='CONFIRMED' AND c.start_date>=? AND c.end_date<=?",Integer.class,
                    session.getCourseId(),member,access.startDate(),access.endDate());
            if(paid==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Khóa học cần đơn đã thanh toán và gói bao phủ toàn khóa");
        } else {
            if (access.sportLimit() != null && !selectedSports(access).contains(session.getSportId()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Chọn bộ môn của kỳ STANDARD trước khi đặt buổi lẻ.");
        }
    }

    public void requireProgramLevel(Access access,String level) {
        if(!TrainingPolicy.levelAllowed(access.level(),level))
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Lớp/khóa này yêu cầu gói VIP");
    }

    private static ResponseStatusException forbidden() {
        return new ResponseStatusException(HttpStatus.FORBIDDEN,"Bạn không được thao tác đăng ký cho thành viên này");
    }
}
