package com.sportscenter.management.service;

import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
@RequiredArgsConstructor
public class FlexibleBookingPolicy {
    private final JdbcTemplate jdbc;
    private final ClassRepository classes;
    private final UserRepository users;
    private final MemberNotificationOutboxService outbox;
    private final Clock clock;
    private final SessionMembershipAccess membershipAccess;
    private final com.sportscenter.management.training.TrainingAccessService trainingAccess;

    @Value("${app.booking.cancel-notice-hours:12}")
    private int cancelNoticeHours;
    @Value("${app.booking.violation-window-days:30}")
    private int violationWindowDays;
    @Value("${app.booking.restriction-days:14}")
    private int restrictionDays;
    @Value("${app.booking.restricted-held:2}")
    private int restrictedHeld;
    @Value("${app.booking.invitation-minutes:15}")
    private int invitationMinutes;

    @Value("${app.booking.maximum-held:5}")
    private int maximumHeld;
    @Value("${app.booking.advance-days:7}")
    private int advanceDays;

    public LocalDateTime now() { return LocalDateTime.now(clock); }

    public record Conduct(int violations, LocalDateTime restrictedUntil) {}
    public record BookingStatus(int held, int limit, int violations, LocalDateTime restrictedUntil) {}
    public record WaitlistEntry(int classId, String status, LocalDateTime inviteUntil, Integer position) {}
    private record Candidate(int member, boolean vip) {}
    public record VipSupplies(LocalDateTime towelAt, LocalDateTime waterAt) {}

    @Transactional
    public VipSupplies recordVipSupplies(int classId, int member, int receptionist, boolean towel, boolean water) {
        var clazz = lockClass(classId);
        if ("CANCELLED".equals(clazz.getStatus()) || (!towel && !water)) {
            throw conflict("Cần chọn khăn hoặc nước cho buổi chưa bị hủy.");
        }
        users.findByIdForUpdate(member).orElseThrow();
        var now = now();
        if (now.isBefore(clazz.getScheduleTime().minusMinutes(15))
                || now.isAfter(clazz.getScheduleTime().plusMinutes(clazz.getDurationMinutes()).plusHours(1))) {
            throw conflict("Chỉ xác nhận khăn/nước trong khung giờ check-in.");
        }
        var day = now.toLocalDate();
        if (count("""
                SELECT COUNT(*) FROM dbo.member_subscriptions s
                JOIN dbo.membership_packages p ON p.package_id=s.package_id
                WHERE s.member_id=? AND s.status='ACTIVE' AND s.start_date<=? AND s.end_date>=?
                  AND COALESCE(s.entitlement_level,p.access_level)='VIP'
                """, member, day, day) == 0) throw conflict("Quyền lợi này chỉ dành cho VIP đang hiệu lực.");
        if (jdbc.update("""
                UPDATE dbo.attendances SET
                  vip_towel_at=COALESCE(vip_towel_at,?), vip_water_at=COALESCE(vip_water_at,?),
                  vip_supplies_by=COALESCE(vip_supplies_by,?)
                WHERE class_id=? AND member_id=? AND status='PRESENT'
                """, towel ? now : null, water ? now : null, receptionist, classId, member) != 1) {
            throw conflict("Cần check-in Có mặt trước khi cấp khăn hoặc nước.");
        }
        return jdbc.queryForObject("""
                SELECT vip_towel_at, vip_water_at FROM dbo.attendances WHERE class_id=? AND member_id=?
                """, (r, n) -> new VipSupplies(r.getObject(1, LocalDateTime.class), r.getObject(2, LocalDateTime.class)),
                classId, member);
    }

    public Conduct conduct(int member) {
        return jdbc.queryForObject("""
                WITH valid AS (
                    SELECT b.* FROM dbo.booking_violations b JOIN dbo.classes c ON c.class_id=b.class_id
                    LEFT JOIN dbo.attendances a ON a.class_id=b.class_id AND a.member_id=b.member_id
                    WHERE b.member_id=? AND b.excused_at IS NULL AND c.status<>'CANCELLED'
                      AND (b.kind='LATE_CANCEL' OR a.status='ABSENT')
                )
                SELECT (SELECT COUNT(*) FROM valid WHERE recorded_at>=?),
                    (SELECT MAX(window_end) FROM (
                        SELECT MAX(restriction_until) AS window_end FROM valid
                        WHERE consumed_at IS NOT NULL GROUP BY consumed_at HAVING COUNT(*)>=3
                    ) AS restrictions)
                """, (r, n) -> new Conduct(r.getInt(1), r.getObject(2, LocalDateTime.class)),
                member, now().minusDays(violationWindowDays));
    }

    public int holdingLimit(int member, int normalLimit) {
        var until = conduct(member).restrictedUntil();
        return until != null && until.isAfter(now()) ? Math.min(normalLimit, restrictedHeld) : normalLimit;
    }

    public BookingStatus status(int member, int normalLimit) {
        var conduct = conduct(member);
        boolean restricted = conduct.restrictedUntil() != null && conduct.restrictedUntil().isAfter(now());
        int held = count("""
                SELECT COUNT(*) FROM dbo.class_bookings b JOIN dbo.classes c ON c.class_id=b.class_id
                WHERE b.member_id=? AND b.status='BOOKED' AND c.status='SCHEDULED'
                  AND c.regular_class_id IS NULL AND c.course_id IS NULL
                  AND DATEADD(minute,c.duration_minutes,c.schedule_time)>?
                """, member, now());
        return new BookingStatus(held, restricted ? Math.min(normalLimit, restrictedHeld) : normalLimit,
                conduct.violations(), restricted ? conduct.restrictedUntil() : null);
    }

    public void recordCancellation(Classes clazz, int member) {
        if (clazz.getScheduleTime().isBefore(now().plusHours(cancelNoticeHours))) {
            recordViolation(clazz, member, "LATE_CANCEL");
        }
    }

    @Transactional
    public void confirmNoShow(int classId, int member, Integer coachScope) {
        var clazz = lockClass(classId);
        if (coachScope != null && !coachScope.equals(clazz.getCoachId())) {
            throw new org.springframework.security.access.AccessDeniedException("Lớp không thuộc phạm vi phụ trách.");
        }
        if ("CANCELLED".equals(clazz.getStatus())
                || now().isBefore(clazz.getScheduleTime().plusMinutes(clazz.getDurationMinutes()))) {
            throw conflict("Chỉ xác nhận vắng sau khi lớp kết thúc và lớp chưa bị hủy.");
        }
        users.findByIdForUpdate(member).orElseThrow();
        if (count("""
                SELECT COUNT(*) FROM dbo.class_bookings b JOIN dbo.attendances a
                  ON a.class_id=b.class_id AND a.member_id=b.member_id
                WHERE b.class_id=? AND b.member_id=? AND b.status='BOOKED' AND a.status='ABSENT'
                """, classId, member) != 1) {
            throw conflict("Cần bản điểm danh Vắng đã xác nhận và booking đang có hiệu lực.");
        }
        recordViolation(clazz, member, "NO_SHOW");
    }

    @Transactional
    public void excuse(int classId, int member, int manager) {
        users.findByIdForUpdate(member).orElseThrow();
        if (jdbc.update("""
                UPDATE dbo.booking_violations SET excused_at=?, excused_by=?
                WHERE class_id=? AND member_id=? AND excused_at IS NULL
                """, now(), manager, classId, member) != 1) {
            throw conflict("Không tìm thấy vi phạm đang hiệu lực cho buổi này.");
        }
    }

    private void recordViolation(Classes clazz, int member, String kind) {
        var now = now();
        int id = clazz.getId();
        if (jdbc.update("""
                INSERT dbo.booking_violations(class_id, member_id, kind, recorded_at)
                SELECT ?, ?, ?, ? WHERE NOT EXISTS
                    (SELECT 1 FROM dbo.booking_violations WHERE class_id=? AND member_id=?)
                """, id, member, kind, now, id, member) == 0) return;
        int triggers = count("""
                SELECT COUNT(*) FROM dbo.booking_violations b JOIN dbo.classes c ON c.class_id=b.class_id
                LEFT JOIN dbo.attendances a ON a.class_id=b.class_id AND a.member_id=b.member_id
                WHERE b.member_id=? AND b.recorded_at>=? AND b.consumed_at IS NULL AND b.excused_at IS NULL
                  AND c.status<>'CANCELLED' AND (b.kind='LATE_CANCEL' OR a.status='ABSENT')
                """, member, now.minusDays(violationWindowDays));
        if (triggers >= 3) {
            jdbc.update("""
                    UPDATE b SET consumed_at=?, restriction_until=?
                    FROM dbo.booking_violations b JOIN dbo.classes c ON c.class_id=b.class_id
                    LEFT JOIN dbo.attendances a ON a.class_id=b.class_id AND a.member_id=b.member_id
                    WHERE b.member_id=? AND b.recorded_at>=? AND b.consumed_at IS NULL AND b.excused_at IS NULL
                      AND c.status<>'CANCELLED' AND (b.kind='LATE_CANCEL' OR a.status='ABSENT')
                    """, now, now.plusDays(restrictionDays), member, now.minusDays(violationWindowDays));
            notify(clazz, member, "RESTRICTION:" + id, "Tạm giới hạn giữ chỗ",
                    "Bạn có ba vi phạm trong thời gian theo dõi. Giới hạn mới áp dụng cho lượt đặt tiếp theo.");
        } else if (triggers == 2) {
            notify(clazz, member, "WARNING:" + id, "Cảnh báo giữ chỗ",
                    "Bạn có hai vi phạm trong thời gian theo dõi. Vui lòng hủy sớm nếu không thể đến.");
        }
    }

    @Transactional
    public WaitlistEntry join(int classId, int member) {
        trainingAccess.lock();
        Classes clazz = lockClass(classId);
        if (clazz.getRegularClassId() != null || clazz.getCourseId() != null) {
            throw conflict("Danh sách chờ chỉ áp dụng cho buổi tập linh hoạt.");
        }
        if (!open(clazz)) throw conflict("Buổi này đã đóng đăng ký.");
        trainingAccess.lockMember(member);
        membershipAccess.require(clazz, member, true);
        if (count("SELECT COUNT(*) FROM dbo.class_bookings WHERE class_id=? AND member_id=? AND status='BOOKED'",
                classId, member) > 0) throw conflict("Bạn đã đăng ký buổi này.");
        advance(clazz);
        var existing = entry(classId, member);
        if (existing != null && List.of("QUEUED", "INVITED").contains(existing.status())) return withPosition(existing, clazz, member);
        if (available(clazz, member) > 0) throw conflict("Buổi này còn chỗ. Bạn có thể đăng ký trực tiếp.");
        if (existing == null) {
            jdbc.update("INSERT dbo.class_waitlist(class_id, member_id, joined_at, status) VALUES(?,?,?,'QUEUED')",
                    classId, member, now());
        } else {
            jdbc.update("UPDATE dbo.class_waitlist SET joined_at=?, invite_until=NULL, status='QUEUED' WHERE class_id=? AND member_id=?",
                    now(), classId, member);
        }
        return withPosition(entry(classId, member), clazz, member);
    }

    @Transactional
    public WaitlistEntry decline(int classId, int member) {
        trainingAccess.lock();
        Classes clazz = lockClass(classId);
        if (!open(clazz)) throw conflict("Buổi này đã đóng đăng ký.");
        var now = now();
        int changed = jdbc.update("""
                UPDATE dbo.class_waitlist SET status='CANCELLED'
                WHERE class_id=? AND member_id=?
                  AND (status='QUEUED' OR (status='INVITED' AND invite_until>?))
                """, classId, member, now);
        if (changed != 1) throw conflict("Lời mời hoặc lượt chờ không còn hiệu lực.");
        WaitlistEntry declined = entry(classId, member);
        if (declined.inviteUntil() == null) {
            notify(clazz, member, "WAITLIST_LEFT:" + classId + ":" + now,
                    "Đã rời danh sách chờ", "Bạn đã rời danh sách chờ của lớp " + clazz.getClassName() + ".");
        } else {
            notify(clazz, member, "WAITLIST_DECLINED:" + classId + ":" + declined.inviteUntil(),
                    "Đã từ chối lời mời giữ chỗ", "Bạn đã từ chối lời mời cho lớp " + clazz.getClassName() + ".");
            advance(clazz);
        }
        return declined;
    }

    public List<WaitlistEntry> entries(int member) {
        return jdbc.query("""
                SELECT class_id,status,invite_until FROM dbo.class_waitlist WHERE member_id=? ORDER BY joined_at DESC
                """, (r, n) -> new WaitlistEntry(r.getInt(1), r.getString(2), r.getObject(3, LocalDateTime.class), null), member)
                .stream().map(row -> "QUEUED".equals(row.status())
                        ? classes.findById(row.classId()).map(clazz -> withPosition(row, clazz, member)).orElse(row)
                        : row).toList();
    }

    private WaitlistEntry withPosition(WaitlistEntry entry, Classes clazz, int member) {
        if (!"QUEUED".equals(entry.status()) || !open(clazz)) return entry;
        var ordered = rankedCandidates(clazz, now());
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).member() == member) {
                return new WaitlistEntry(entry.classId(), entry.status(), entry.inviteUntil(), i + 1);
            }
        }
        return entry;
    }

    private WaitlistEntry entry(int classId, int member) {
        return jdbc.query("""
                SELECT class_id,status,invite_until FROM dbo.class_waitlist WHERE member_id=? AND class_id=?
                """, (r, n) -> new WaitlistEntry(r.getInt(1), r.getString(2), r.getObject(3, LocalDateTime.class), null),
                member, classId).stream().findFirst().orElse(null);
    }

    public void requireInvitation(int classId, int member) {
        var entry = entry(classId, member);
        if (entry == null || !"INVITED".equals(entry.status()) || !entry.inviteUntil().isAfter(now())) {
            throw conflict("Lời mời không còn hiệu lực.");
        }
    }

    public int available(Classes clazz, int member) {
        int reserved = count("""
                SELECT COUNT(*) FROM dbo.class_waitlist WHERE class_id=? AND status='INVITED' AND invite_until>? AND member_id<>?
                """, clazz.getId(), now(), member);
        int booked = count("SELECT COUNT(*) FROM dbo.class_bookings WHERE class_id=? AND status='BOOKED'", clazz.getId());
        return clazz.getMaxCapacity() - reserved - booked;
    }

    public void acceptIfInvited(int classId, int member) {
        jdbc.update("""
                UPDATE dbo.class_waitlist SET status='ACCEPTED'
                WHERE class_id=? AND member_id=? AND status IN ('QUEUED','INVITED')
                """, classId, member);
    }

    public List<Integer> pendingSessions() {
        return jdbc.queryForList("SELECT DISTINCT class_id FROM dbo.class_waitlist WHERE status IN ('QUEUED','INVITED')", Integer.class);
    }

    @Transactional
    public void poll(int classId) {
        trainingAccess.lock();
        advance(lockClass(classId));
    }

    // Call only with the session lock held, so all offers and bookings share capacity.
    public void advance(Classes clazz) {
        int id = clazz.getId();
        var now = now();
        var expired = jdbc.queryForList("""
                SELECT member_id FROM dbo.class_waitlist WHERE class_id=? AND status='INVITED' AND invite_until<=?
                """, Integer.class, id, now);
        for (int member : expired) {
            jdbc.update("UPDATE dbo.class_waitlist SET status='EXPIRED' WHERE class_id=? AND member_id=?", id, member);
            notify(clazz, member, "WAITLIST_EXPIRED:" + id + ":" + now, "Lời mời đã hết hạn", clazz.getClassName());
        }
        if (!open(clazz)) {
            jdbc.update("UPDATE dbo.class_waitlist SET status='CANCELLED' WHERE class_id=? AND status IN ('QUEUED','INVITED')", id);
            return;
        }
        int free = available(clazz, 0);
        if (free <= 0) return;
        var candidates = rankedCandidates(clazz, now);
        var until = now.plusMinutes(invitationMinutes);
        if (clazz.getScheduleTime().isBefore(until)) until = clazz.getScheduleTime();
        for (var candidate : candidates.stream().limit(free).toList()) {
            int member = candidate.member();
            if (jdbc.update("UPDATE dbo.class_waitlist SET status='INVITED', invite_until=? WHERE class_id=? AND member_id=? AND status='QUEUED'",
                    until, id, member) != 1) continue;
            notify(clazz, member, "WAITLIST_INVITED:" + id + ":" + until, "Đã đến lượt đặt chỗ",
                    "Bạn có thể xác nhận buổi " + clazz.getClassName() + " trước khi lời mời hết hạn.");
        }
    }

    private List<Candidate> rankedCandidates(Classes clazz, LocalDateTime now) {
        var start = clazz.getScheduleTime();
        if (start.isAfter(now.plusDays(advanceDays))) return List.of();
        var end = start.plusMinutes(clazz.getDurationMinutes() == null ? 60 : clazz.getDurationMinutes());
        var members = jdbc.queryForList("""
                SELECT w.member_id FROM dbo.class_waitlist w
                JOIN dbo.users u ON u.user_id=w.member_id JOIN dbo.roles r ON r.role_id=u.role_id
                WHERE w.class_id=? AND w.status='QUEUED' AND u.status='ACTIVE' AND r.role_name='MEMBER'
                  AND NOT EXISTS (SELECT 1 FROM dbo.class_bookings b WHERE b.class_id=w.class_id
                                  AND b.member_id=w.member_id AND b.status='BOOKED')
                ORDER BY w.joined_at,w.id
                """, Integer.class, clazz.getId());
        var eligible = new ArrayList<Candidate>();
        for (int member : members) {
            try {
                String level = membershipAccess.waitlistLevel(clazz, member, now.toLocalDate());
                var holding = status(member, maximumHeld);
                if (holding.held() >= holding.limit()) continue;
                trainingAccess.requireNoMemberConflict(member, start, end, null, null, clazz.getId());
                eligible.add(new Candidate(member, "VIP".equals(level)));
            } catch (ResponseStatusException ex) {
                if (ex.getStatusCode() != HttpStatus.CONFLICT) throw ex;
            } catch (IllegalArgumentException ex) {
                continue;
            }
        }
        eligible.sort(Comparator.comparing(Candidate::vip).reversed());
        return eligible;
    }

    public Classes lockClass(int id) {
        return classes.findByIdForUpdate(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy buổi tập."));
    }

    private boolean open(Classes clazz) {
        return "SCHEDULED".equals(clazz.getStatus()) && clazz.getScheduleTime().isAfter(now());
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private void notify(Classes clazz, int member, String key, String title, String content) {
        String message = key.startsWith("WAITLIST_")
                ? content + "\n" + MemberClassNotifications.sessionSchedule(clazz.getScheduleTime(), clazz.getDurationMinutes())
                : content;
        outbox.enqueue(key, clazz.getCoachId(), member, title, message, "/classes");
    }

    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
