package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.training.TrainingProgramService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class RecurringClassService {
    private final ClassService classes;
    private final JdbcTemplate jdbc;
    private final TrainingProgramService trainingPrograms;

    public record PublishedSession(String seriesKey, LocalDate plannedDate, int classId) {}

    @Transactional(readOnly = true)
    public List<PublishedSession> published() {
        return jdbc.query("""
                SELECT recurrence_key, session_date, class_id FROM dbo.recurring_class_sessions
                ORDER BY recurrence_key, session_date
                """, (row, index) -> new PublishedSession(
                row.getString(1), row.getObject(2, LocalDate.class), row.getInt(3)));
    }

    @Transactional
    public List<ClassResponse> publish(ClassRequest session, LocalDate through, Set<DayOfWeek> weekdays) {
        var start = session.getScheduleTime();
        if (start == null || weekdays.isEmpty() || weekdays.stream().anyMatch(Objects::isNull)
                || through.isBefore(start.toLocalDate()) || through.isAfter(start.toLocalDate().plusDays(90))) {
            throw new IllegalArgumentException("Chọn giờ bắt đầu, ngày trong tuần và khoảng lặp tối đa 90 ngày.");
        }
        FlexibleClassSlot.requireScheduledSlot(start, session.getDurationMinutes());
        trainingPrograms.lock();
        String key = key(session, through, weekdays);
        // Start the SQL Server transaction before asking for a transaction-owned lock.
        jdbc.queryForObject("SELECT COUNT(*) FROM dbo.recurring_class_sessions WHERE recurrence_key=?", Integer.class, key);
        Integer lock = jdbc.queryForObject("""
                SET NOCOUNT ON;
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock @Resource=?, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
                SELECT @result;
                """, Integer.class, "recurring-class:" + key);
        if (lock == null || lock < 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Lịch đang được xử lý. Vui lòng thử lại.");
        }
        var results = new ArrayList<ClassResponse>();
        for (var day = start.toLocalDate(); !day.isAfter(through); day = day.plusDays(1)) {
            if (!weekdays.contains(day.getDayOfWeek())) continue;
            var existing = jdbc.queryForList("""
                    SELECT class_id FROM dbo.recurring_class_sessions WHERE recurrence_key=? AND session_date=?
                    """, Integer.class, key, day);
            if (!existing.isEmpty()) {
                results.add(classes.getClassById(existing.getFirst()).orElseThrow());
                continue;
            }
            var request = ClassRequest.builder().className(session.getClassName()).sportId(session.getSportId())
                    .coachId(session.getCoachId()).roomId(session.getRoomId()).maxCapacity(session.getMaxCapacity())
                    .durationMinutes(session.getDurationMinutes()).requiredAccessLevel(session.getRequiredAccessLevel())
                    .scheduleTime(day.atTime(start.toLocalTime())).build();
            try {
                var created = classes.createClass(request);
                jdbc.update("INSERT dbo.recurring_class_sessions(recurrence_key,session_date,class_id) VALUES(?,?,?)",
                        key, day, created.getId());
                results.add(created);
            } catch (IllegalArgumentException invalid) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Buổi ngày " + day + ": " + invalid.getMessage(), invalid);
            }
        }
        if (results.isEmpty()) throw new IllegalArgumentException("Không có buổi nào khớp các ngày đã chọn.");
        return results;
    }

    private String key(ClassRequest s, LocalDate through, Set<DayOfWeek> weekdays) {
        String value = String.join("|", String.valueOf(s.getSportId()), String.valueOf(s.getCoachId()),
                String.valueOf(s.getRoomId()), String.valueOf(s.getMaxCapacity()), String.valueOf(s.getScheduleTime()),
                String.valueOf(s.getDurationMinutes()), String.valueOf(s.getRequiredAccessLevel()), through.toString(),
                weekdays.stream().sorted().toList().toString(), String.valueOf(s.getClassName()));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
