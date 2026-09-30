package com.sportscenter.attendance;

import com.sportscenter.common.service.DomainServiceSupport;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class AttendanceService extends DomainServiceSupport {
    public AttendanceService(JdbcTemplate jdbc) { super(jdbc); }

    private static final Set<String> ATTENDANCE_STATUSES = Set.of("PRESENT", "ABSENT");

    @Transactional
    public Map<String, Object> recordAttendance(long coachId, long memberId, long scheduleId, String status) {
        String normalizedStatus = normalizeChoice(status, ATTENDANCE_STATUSES, "Trạng thái điểm danh không hợp lệ.");
        requireRole(coachId, "COACH");
        Integer authorized = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.class_schedules s
                JOIN dbo.class_enrollments e ON e.class_schedule_id = s.id AND e.user_id = ? AND e.status = 'REGISTERED'
                WHERE s.id = ? AND s.coach_id = ?
                """, Integer.class, memberId, scheduleId, coachId);
        if (authorized == null || authorized == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Học viên chưa đăng ký lớp hoặc bạn không phụ trách lớp này.");
        }
        List<Long> records = jdbc.query("""
                SELECT id FROM dbo.attendances WHERE user_id = ? AND class_schedule_id = ?
                """, (rs, row) -> rs.getLong(1), memberId, scheduleId);
        if (records.isEmpty()) {
            long id = jdbc.queryForObject("""
                    INSERT INTO dbo.attendances (user_id, class_schedule_id, status)
                    OUTPUT INSERTED.id VALUES (?, ?, ?)
                    """, Long.class, memberId, scheduleId, normalizedStatus);
            return jdbc.queryForMap("SELECT * FROM dbo.attendances WHERE id = ?", id);
        }
        jdbc.update("""
                UPDATE dbo.attendances SET status = ?, check_in_time = SYSUTCDATETIME()
                WHERE id = ?
                """, normalizedStatus, records.getFirst());
        return jdbc.queryForMap("SELECT * FROM dbo.attendances WHERE id = ?", records.getFirst());
    }

    public List<Map<String, Object>> memberAttendance(String email) {
        return jdbc.queryForList("""
                SELECT a.id, a.check_in_time, a.status, c.name AS class_name, s.start_time
                FROM dbo.attendances a
                JOIN dbo.users u ON u.id = a.user_id
                LEFT JOIN dbo.class_schedules s ON s.id = a.class_schedule_id
                LEFT JOIN dbo.classes c ON c.id = s.class_id
                WHERE u.email = ?
                ORDER BY a.check_in_time DESC
                """, email);
    }

    @Transactional
    public Map<String, Object> checkIn(long memberId) {
        requireMember(memberId);
        if (!exists("""
                SELECT COUNT(*) FROM dbo.user_memberships
                WHERE user_id = ? AND status = 'ACTIVE' AND start_date <= CAST(GETDATE() AS DATE)
                  AND end_date >= CAST(GETDATE() AS DATE)
                """, memberId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Thành viên cần có gói tập còn hiệu lực để điểm danh.");
        }
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.attendances (user_id, status)
                OUTPUT INSERTED.id VALUES (?, 'PRESENT')
                """, Long.class, memberId);
        return jdbc.queryForMap("SELECT id, user_id, class_schedule_id, check_in_time, status FROM dbo.attendances WHERE id = ?", id);
    }
}
