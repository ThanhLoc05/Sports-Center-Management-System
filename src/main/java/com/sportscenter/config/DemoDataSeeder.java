package com.sportscenter.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(prefix = "app", name = "seed-demo-data", havingValue = "true")
public class DemoDataSeeder implements ApplicationRunner {
    private static final String DEMO_PASSWORD = "ChangeMe123!";

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate transaction;

    public DemoDataSeeder(JdbcTemplate jdbc, PasswordEncoder passwordEncoder,
                          TransactionTemplate transaction) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.transaction = transaction;
    }

    @Override
    public void run(ApplicationArguments args) {
        transaction.executeWithoutResult(status -> seed());
    }

    private void seed() {
        user("manager@sportscenter.local", "Quản lý mẫu", "MANAGER");
        user("reception@sportscenter.local", "Lễ tân mẫu", "RECEPTIONIST");
        long coachId = user("coach@sportscenter.local", "Huấn luyện viên mẫu", "COACH");
        long memberId = user("member@sportscenter.local", "Thành viên mẫu", "MEMBER");
        ensureMemberProfile(memberId);
        ensureMembership(memberId);
        ensureSchedules(coachId);
        ensureEnrollment(memberId, classId("Yoga cơ bản"));
        ensureFreeAttendance(memberId);
        ensureWorkoutPlan(coachId, memberId);
    }

    private long user(String email, String fullName, String role) {
        List<Long> existing = jdbc.query("SELECT id FROM dbo.users WHERE email = ?",
                (rs, row) -> rs.getLong(1), email);
        if (!existing.isEmpty()) {
            return existing.getFirst();
        }
        return jdbc.queryForObject("""
                INSERT INTO dbo.users (email, password_hash, full_name, role, status)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, 'ACTIVE')
                """, Long.class, email, passwordEncoder.encode(DEMO_PASSWORD), fullName, role);
    }

    private void ensureMemberProfile(long memberId) {
        if (count("SELECT COUNT(*) FROM dbo.member_profiles WHERE user_id = ?", memberId) == 0) {
            jdbc.update("""
                    INSERT INTO dbo.member_profiles (user_id, fitness_goal)
                    VALUES (?, N'Cải thiện sức bền và duy trì thói quen tập luyện')
                    """, memberId);
        }
    }

    private void ensureMembership(long memberId) {
        if (count("""
                SELECT COUNT(*) FROM dbo.user_memberships
                WHERE user_id = ? AND status = 'ACTIVE' AND end_date >= CAST(GETDATE() AS DATE)
                """, memberId) > 0) {
            return;
        }
        Map<String, Object> pack = jdbc.queryForMap("""
                SELECT TOP 1 id, duration_days, price FROM dbo.memberships
                WHERE name = N'Gói tháng' AND is_active = 1
                """);
        long membershipId = ((Number) pack.get("id")).longValue();
        LocalDate start = LocalDate.now();
        LocalDate end = start.plusDays(((Number) pack.get("duration_days")).longValue() - 1);
        long userMembershipId = jdbc.queryForObject("""
                INSERT INTO dbo.user_memberships (user_id, membership_id, start_date, end_date, status)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, 'ACTIVE')
                """, Long.class, memberId, membershipId, start, end);
        jdbc.update("""
                INSERT INTO dbo.invoices (user_id, user_membership_id, total_amount, payment_method)
                VALUES (?, ?, ?, 'BANK_TRANSFER')
                """, memberId, userMembershipId, (BigDecimal) pack.get("price"));
    }

    private void ensureSchedules(long coachId) {
        Long yogaId = classId("Yoga cơ bản");
        Long fitnessId = classId("Rèn luyện thể lực");
        Long multipurposeRoomId = roomId("Phòng đa năng");
        Long fitnessRoomId = roomId("Phòng thể lực");
        LocalDateTime tomorrowMorning = LocalDate.now().plusDays(1).atTime(9, 0);
        LocalDateTime tomorrowEvening = LocalDate.now().plusDays(1).atTime(18, 0);
        ensureSchedule(yogaId, coachId, multipurposeRoomId, tomorrowMorning, tomorrowMorning.plusHours(1));
        ensureSchedule(fitnessId, coachId, fitnessRoomId, tomorrowEvening, tomorrowEvening.plusHours(1));
    }

    private Long classId(String name) {
        return jdbc.queryForObject("SELECT id FROM dbo.classes WHERE name = ?", Long.class, name);
    }

    private Long roomId(String name) {
        return jdbc.queryForObject("SELECT id FROM dbo.rooms WHERE name = ?", Long.class, name);
    }

    private void ensureSchedule(long classId, long coachId, long roomId,
                                LocalDateTime start, LocalDateTime end) {
        if (count("""
                SELECT COUNT(*) FROM dbo.class_schedules
                WHERE class_id = ? AND coach_id = ? AND start_time = ?
                """, classId, coachId, start) == 0) {
            jdbc.update("""
                    INSERT INTO dbo.class_schedules (class_id, coach_id, room_id, start_time, end_time)
                    VALUES (?, ?, ?, ?, ?)
                    """, classId, coachId, roomId, start, end);
        }
    }

    private void ensureEnrollment(long memberId, long classId) {
        Long scheduleId = jdbc.query("""
                SELECT TOP 1 id FROM dbo.class_schedules
                WHERE class_id = ? AND start_time > GETDATE()
                ORDER BY start_time
                """, rs -> rs.next() ? rs.getLong(1) : null, classId);
        if (scheduleId != null && count("""
                SELECT COUNT(*) FROM dbo.class_enrollments
                WHERE user_id = ? AND class_schedule_id = ?
                """, memberId, scheduleId) == 0) {
            jdbc.update("""
                    INSERT INTO dbo.class_enrollments (user_id, class_schedule_id, status)
                    VALUES (?, ?, 'REGISTERED')
                    """, memberId, scheduleId);
        }
    }

    private void ensureFreeAttendance(long memberId) {
        if (count("""
                SELECT COUNT(*) FROM dbo.attendances
                WHERE user_id = ? AND class_schedule_id IS NULL
                  AND CAST(check_in_time AS DATE) = CAST(GETDATE() AS DATE)
                """, memberId) == 0) {
            jdbc.update("""
                    INSERT INTO dbo.attendances (user_id, status)
                    VALUES (?, 'PRESENT')
                    """, memberId);
        }
    }

    private void ensureWorkoutPlan(long coachId, long memberId) {
        if (count("""
                SELECT COUNT(*) FROM dbo.workout_plans
                WHERE coach_id = ? AND member_id = ? AND title = N'Kế hoạch thể lực cơ bản'
                """, coachId, memberId) == 0) {
            jdbc.update("""
                    INSERT INTO dbo.workout_plans (title, coach_id, member_id, description)
                    VALUES (N'Kế hoạch thể lực cơ bản', ?, ?, N'Khởi động 10 phút, tập sức bền 20 phút, giãn cơ 10 phút.')
                    """, coachId, memberId);
        }
    }

    private int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }
}
