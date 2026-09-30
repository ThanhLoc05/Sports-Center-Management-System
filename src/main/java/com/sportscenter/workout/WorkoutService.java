package com.sportscenter.workout;

import com.sportscenter.common.service.DomainServiceSupport;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Service
public class WorkoutService extends DomainServiceSupport {
    public WorkoutService(JdbcTemplate jdbc) { super(jdbc); }

    public record ExerciseInput(String name, Integer sets, Integer reps, BigDecimal weightKg) { }

    @Transactional
    public Map<String, Object> createWorkoutPlan(long coachId, String title, Long memberId,
                                                  Long classId, String description) {
        requireRole(coachId, "COACH");
        if ((memberId == null) == (classId == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kế hoạch phải gắn với đúng một học viên hoặc lớp.");
        }
        if (memberId != null) {
            requireMember(memberId);
        }
        if (classId != null && !exists("SELECT COUNT(*) FROM dbo.classes WHERE id = ? AND is_active = 1", classId)) {
            throw notFound("Không tìm thấy lớp đang hoạt động.");
        }
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.workout_plans (title, coach_id, member_id, class_id, description)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)
                """, Long.class, title.trim(), coachId, memberId, classId, description);
        return jdbc.queryForMap("""
                SELECT id, title, coach_id, member_id, class_id, description, created_at
                FROM dbo.workout_plans WHERE id = ?
                """, id);
    }

    public List<Map<String, Object>> memberWorkoutPlans(String email) {
        return jdbc.queryForList("""
                SELECT p.id, p.title, p.description, p.created_at, coach.full_name AS coach_name,
                       c.name AS class_name
                FROM dbo.workout_plans p
                JOIN dbo.users m ON m.email = ?
                JOIN dbo.users coach ON coach.id = p.coach_id
                LEFT JOIN dbo.classes c ON c.id = p.class_id
                WHERE p.member_id = m.id
                   OR (p.class_id IS NOT NULL AND EXISTS (
                       SELECT 1 FROM dbo.class_schedules s
                       JOIN dbo.class_enrollments e ON e.class_schedule_id = s.id
                       WHERE s.class_id = p.class_id AND e.user_id = m.id AND e.status = 'REGISTERED'
                   ))
                ORDER BY p.created_at DESC
                """, email);
    }

    public List<Map<String, Object>> memberWorkoutLogs(String email) {
        return jdbc.queryForList("""
                SELECT l.id, l.feedback_from_coach, l.created_at, coach.full_name AS coach_name,
                       c.name AS class_name, d.exercise_name, d.sets, d.reps, d.weight_kg
                FROM dbo.workout_logs l
                JOIN dbo.users m ON m.id = l.member_id
                JOIN dbo.users coach ON coach.id = l.coach_id
                LEFT JOIN dbo.class_schedules s ON s.id = l.schedule_id
                LEFT JOIN dbo.classes c ON c.id = s.class_id
                LEFT JOIN dbo.workout_log_details d ON d.log_id = l.id
                WHERE m.email = ?
                ORDER BY l.created_at DESC, d.id
                """, email);
    }

    @Transactional
    public Map<String, Object> createWorkoutLog(long coachId, long memberId, Long scheduleId,
                                                 String feedback, List<ExerciseInput> exercises) {
        requireRole(coachId, "COACH");
        requireMember(memberId);
        if (scheduleId != null) {
            Integer authorized = jdbc.queryForObject("""
                    SELECT COUNT(*) FROM dbo.class_schedules
                    WHERE id = ? AND coach_id = ?
                    """, Integer.class, scheduleId, coachId);
            if (authorized == null || authorized == 0) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không được phân công lịch học này.");
            }
        }
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.workout_logs (member_id, coach_id, schedule_id, feedback_from_coach)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?)
                """, Long.class, memberId, coachId, scheduleId, feedback);
        for (ExerciseInput exercise : exercises) {
            jdbc.update("""
                    INSERT INTO dbo.workout_log_details (log_id, exercise_name, sets, reps, weight_kg)
                    VALUES (?, ?, ?, ?, ?)
                    """, id, exercise.name(), exercise.sets(), exercise.reps(), exercise.weightKg());
        }
        return jdbc.queryForMap("SELECT id, member_id, coach_id, schedule_id, feedback_from_coach, created_at FROM dbo.workout_logs WHERE id = ?", id);
    }
}
