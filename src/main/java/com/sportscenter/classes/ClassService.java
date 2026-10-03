package com.sportscenter.classes;

import com.sportscenter.common.service.DomainServiceSupport;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class ClassService extends DomainServiceSupport {
    public ClassService(JdbcTemplate jdbc) { super(jdbc); }


    public List<Map<String, Object>> classes() {
        return jdbc.queryForList("""
                SELECT id, name, description, max_capacity, is_active
                FROM dbo.classes WHERE is_active = 1 ORDER BY name
                """);
    }

    public List<Map<String, Object>> rooms() {
        return jdbc.queryForList("SELECT id, name, capacity, description FROM dbo.rooms ORDER BY name");
    }

    @Transactional
    public Map<String, Object> createRoom(String name, int capacity, String description) {
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.rooms (name, capacity, description)
                OUTPUT INSERTED.id VALUES (?, ?, ?)
                """, Long.class, name.trim(), capacity, description);
        return jdbc.queryForMap("SELECT id, name, capacity, description FROM dbo.rooms WHERE id = ?", id);
    }

    @Transactional
    public Map<String, Object> createClass(String name, String description, int maxCapacity) {
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.classes (name, description, max_capacity)
                OUTPUT INSERTED.id VALUES (?, ?, ?)
                """, Long.class, name.trim(), description, maxCapacity);
        return jdbc.queryForMap("SELECT id, name, description, max_capacity, is_active FROM dbo.classes WHERE id = ?", id);
    }

    public List<Map<String, Object>> schedules(LocalDateTime from, LocalDateTime to) {
        if (from != null && to != null && !to.isAfter(from)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thời điểm kết thúc phải sau thời điểm bắt đầu.");
        }
        StringBuilder sql = new StringBuilder("""
                SELECT s.id, s.class_id, c.name AS class_name, c.description AS class_description,
                       c.max_capacity, s.coach_id, coach.full_name AS coach_name, s.room_id, r.name AS room_name,
                       s.start_time, s.end_time,
                       (SELECT COUNT(*) FROM dbo.class_enrollments e
                        WHERE e.class_schedule_id = s.id AND e.status = 'REGISTERED') AS enrolled_count
                FROM dbo.class_schedules s
                JOIN dbo.classes c ON c.id = s.class_id
                JOIN dbo.users coach ON coach.id = s.coach_id
                JOIN dbo.rooms r ON r.id = s.room_id
                WHERE s.start_time >= ?
                """);
        List<Object> args = new ArrayList<>();
        args.add(from == null ? LocalDateTime.now() : from);
        if (to != null) {
            sql.append(" AND s.start_time < ?");
            args.add(to);
        }
        sql.append(" ORDER BY s.start_time");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    @Transactional
    public Map<String, Object> createSchedule(long classId, long coachId, long roomId,
                                               LocalDateTime startTime, LocalDateTime endTime) {
        if (endTime == null || startTime == null || !endTime.isAfter(startTime)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thời điểm kết thúc phải sau thời điểm bắt đầu.");
        }
        requireRole(coachId, "COACH");
        Integer capacity = jdbc.query("""
                SELECT max_capacity FROM dbo.classes WHERE id = ? AND is_active = 1
                """, rs -> rs.next() ? rs.getInt(1) : null, classId);
        if (capacity == null) {
            throw notFound("Không tìm thấy lớp đang hoạt động.");
        }
        Integer roomCapacity = jdbc.query("""
                SELECT capacity FROM dbo.rooms WHERE id = ?
                """, rs -> rs.next() ? rs.getInt(1) : null, roomId);
        if (roomCapacity == null) {
            throw notFound("Không tìm thấy phòng tập.");
        }
        if (roomCapacity < capacity) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sức chứa phòng nhỏ hơn sĩ số tối đa của lớp.");
        }
        Integer conflictCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.class_schedules
                WHERE (room_id = ? OR coach_id = ?)
                  AND start_time < ? AND end_time > ?
                """, Integer.class, roomId, coachId, endTime, startTime);
        if (conflictCount != null && conflictCount > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Phòng hoặc huấn luyện viên đã có lịch trong khoảng thời gian này.");
        }
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.class_schedules (class_id, coach_id, room_id, start_time, end_time)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)
                """, Long.class, classId, coachId, roomId, startTime, endTime);
        return scheduleById(id);
    }

    public List<Map<String, Object>> enrollments(String email) {
        return jdbc.queryForList("""
                SELECT e.id, e.status, e.enrolled_at, s.id AS schedule_id, s.start_time, s.end_time,
                       c.name AS class_name, coach.full_name AS coach_name, r.name AS room_name
                FROM dbo.class_enrollments e
                JOIN dbo.users u ON u.id = e.user_id
                JOIN dbo.class_schedules s ON s.id = e.class_schedule_id
                JOIN dbo.classes c ON c.id = s.class_id
                JOIN dbo.users coach ON coach.id = s.coach_id
                JOIN dbo.rooms r ON r.id = s.room_id
                WHERE u.email = ?
                ORDER BY s.start_time DESC
                """, email);
    }

    @Transactional
    public Map<String, Object> enroll(long memberId, long scheduleId) {
        requireMember(memberId);
        Integer hasMembership = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.user_memberships
                WHERE user_id = ? AND status = 'ACTIVE' AND start_date <= CAST(GETDATE() AS DATE)
                  AND end_date >= CAST(GETDATE() AS DATE)
                """, Integer.class, memberId);
        if (hasMembership == null || hasMembership == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Thành viên cần có gói tập còn hiệu lực để đăng ký lớp.");
        }

        Long lockedScheduleId = jdbc.query("""
                SELECT id FROM dbo.class_schedules WITH (UPDLOCK, HOLDLOCK)
                WHERE id = ? AND start_time > GETDATE()
                """, rs -> rs.next() ? rs.getLong(1) : null, scheduleId);
        if (lockedScheduleId == null) {
            throw notFound("Không tìm thấy lịch học sắp diễn ra.");
        }
        Map<String, Object> schedule = scheduleById(scheduleId);
        Integer existing = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.class_enrollments WHERE user_id = ? AND class_schedule_id = ?
                """, Integer.class, memberId, scheduleId);
        if (existing != null && existing > 0) {
            String status = jdbc.queryForObject("""
                    SELECT status FROM dbo.class_enrollments WHERE user_id = ? AND class_schedule_id = ?
                    """, String.class, memberId, scheduleId);
            if ("REGISTERED".equals(status)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Bạn đã đăng ký lịch học này.");
            }
        }
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.class_enrollments
                WHERE class_schedule_id = ? AND status = 'REGISTERED'
                """, Integer.class, scheduleId);
        if (count != null && count >= ((Number) schedule.get("max_capacity")).intValue()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lớp đã đủ số lượng học viên.");
        }

        if (existing != null && existing > 0) {
            jdbc.update("""
                    UPDATE dbo.class_enrollments
                    SET status = 'REGISTERED', enrolled_at = SYSUTCDATETIME()
                    WHERE user_id = ? AND class_schedule_id = ?
                    """, memberId, scheduleId);
        } else {
            jdbc.update("""
                    INSERT INTO dbo.class_enrollments (user_id, class_schedule_id, status)
                    VALUES (?, ?, 'REGISTERED')
                    """, memberId, scheduleId);
        }
        return jdbc.queryForMap("""
                SELECT id, user_id, class_schedule_id, status, enrolled_at
                FROM dbo.class_enrollments WHERE user_id = ? AND class_schedule_id = ?
                """, memberId, scheduleId);
    }

    @Transactional
    public void cancelEnrollment(long memberId, long enrollmentId) {
        int updated = jdbc.update("""
                UPDATE dbo.class_enrollments SET status = 'CANCELLED'
                WHERE id = ? AND user_id = ? AND status = 'REGISTERED'
                  AND class_schedule_id IN (
                      SELECT id FROM dbo.class_schedules WHERE start_time > GETDATE()
                  )
                """, enrollmentId, memberId);
        if (updated == 0) {
            throw notFound("Không tìm thấy đăng ký sắp diễn ra hoặc đăng ký đã bị hủy.");
        }
    }

    public List<Map<String, Object>> coachSchedules(String email) {
        return jdbc.queryForList("""
                SELECT s.id, s.start_time, s.end_time, c.name AS class_name, r.name AS room_name,
                       c.max_capacity,
                       (SELECT COUNT(*) FROM dbo.class_enrollments e
                        WHERE e.class_schedule_id = s.id AND e.status = 'REGISTERED') AS enrolled_count
                FROM dbo.class_schedules s
                JOIN dbo.users coach ON coach.id = s.coach_id
                JOIN dbo.classes c ON c.id = s.class_id
                JOIN dbo.rooms r ON r.id = s.room_id
                WHERE coach.email = ? AND s.end_time > GETDATE()
                ORDER BY s.start_time
                """, email);
    }

    public List<Map<String, Object>> scheduleMembers(long scheduleId, String email) {
        Integer authorized = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.class_schedules s JOIN dbo.users u ON u.id = s.coach_id
                WHERE s.id = ? AND u.email = ?
                """, Integer.class, scheduleId, email);
        if (authorized == null || authorized == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không được phân công lịch học này.");
        }
        return jdbc.queryForList("""
                SELECT u.id, u.full_name, u.phone, e.status AS enrollment_status
                FROM dbo.class_enrollments e
                JOIN dbo.users u ON u.id = e.user_id
                WHERE e.class_schedule_id = ? AND e.status = 'REGISTERED'
                ORDER BY u.full_name
                """, scheduleId);
    }

    private Map<String, Object> scheduleById(long id) {
        List<Map<String, Object>> found = jdbc.queryForList("""
                SELECT s.id, s.class_id, c.name AS class_name, c.max_capacity, s.coach_id,
                       coach.full_name AS coach_name, s.room_id, r.name AS room_name, s.start_time, s.end_time
                FROM dbo.class_schedules s
                JOIN dbo.classes c ON c.id = s.class_id
                JOIN dbo.users coach ON coach.id = s.coach_id
                JOIN dbo.rooms r ON r.id = s.room_id
                WHERE s.id = ?
                """, id);
        if (found.isEmpty()) {
            throw notFound("Không tìm thấy lịch học.");
        }
        return found.get(0);
    }
}
