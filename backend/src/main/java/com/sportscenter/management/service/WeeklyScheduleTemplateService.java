package com.sportscenter.management.service;

import com.sportscenter.management.service.WeeklyScheduleService.Entry;
import com.sportscenter.management.training.TrainingProgramService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class WeeklyScheduleTemplateService {
    private static final String NAME = "Lịch tập tiêu chuẩn Sportiva";
    private final JdbcTemplate jdbc;
    private final ClassService classes;
    private final TrainingProgramService resources;
    private final WeeklyScheduleService scheduling;

    public record Template(long version, String name, List<Entry> entries) {}
    public record Save(@Min(0) long version, @NotNull @Size(max = 100) List<@NotNull @Valid Entry> entries) {}
    public record Window(@Min(1) long version, @NotNull LocalDate startDate, int weeks,
                         @Size(max = 8400) Set<String> excludedKeys, String token) {}

    @Transactional(readOnly = true)
    public Template get() {
        return jdbc.query("""
                SELECT t.version, e.class_name, e.sport_id, e.coach_id, e.room_id, e.max_capacity,
                       e.slot_number, e.required_access_level, e.day_of_week
                FROM dbo.weekly_schedule_templates t
                LEFT JOIN dbo.weekly_schedule_template_entries e ON e.template_id=t.template_id
                WHERE t.template_name=?
                ORDER BY e.entry_id
                """, rows -> {
            long version = 0;
            var daysByEntry = new LinkedHashMap<Entry, EnumSet<DayOfWeek>>();
            while (rows.next()) {
                version = rows.getLong(1);
                if (rows.getString(2) == null) continue;
                var details = new Entry(rows.getString(2), rows.getInt(3), rows.getInt(4), rows.getInt(5),
                        rows.getInt(6), Set.of(), FlexibleClassSlot.valueOf("SLOT_0" + rows.getInt(7)), rows.getString(8));
                daysByEntry.computeIfAbsent(details, key -> EnumSet.noneOf(DayOfWeek.class))
                        .add(DayOfWeek.of(rows.getInt(9)));
            }
            var entries = daysByEntry.entrySet().stream().map(item -> {
                var details = item.getKey();
                return new Entry(details.className(), details.sportId(), details.coachId(), details.roomId(),
                        details.maxCapacity(), item.getValue(), details.slotCode(), details.requiredAccessLevel());
            }).toList();
            return new Template(version, NAME, entries);
        }, NAME);
    }

    @Transactional
    public Template save(Save input, Integer actor) {
        if (actor == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Không xác định được người lưu mẫu.");
        resources.lock();
        requireVersion(input.version(), get());
        Set<String> coaches = new HashSet<>();
        Set<String> rooms = new HashSet<>();
        for (var entry : input.entries()) {
            classes.validatePlanningResources(entry.requestOn(LocalDate.of(2000, 1, 1)));
            for (var day : entry.weekdays()) {
                String cell = day.getValue() + ":" + entry.slotCode() + ":";
                if (!coaches.add(cell + entry.coachId()) || !rooms.add(cell + entry.roomId())) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "Trùng HLV hoặc sân/phòng trong cùng ngày và ca.");
                }
            }
        }

        Integer id;
        if (input.version() == 0) {
            id = jdbc.queryForObject("""
                    INSERT dbo.weekly_schedule_templates(template_name,version,saved_by)
                    OUTPUT INSERTED.template_id VALUES(?,1,?)
                    """, Integer.class, NAME, actor);
        } else {
            id = jdbc.queryForObject("SELECT template_id FROM dbo.weekly_schedule_templates WHERE template_name=?", Integer.class, NAME);
            jdbc.update("""
                    UPDATE dbo.weekly_schedule_templates SET version=version+1,saved_by=?,saved_at=SYSUTCDATETIME()
                    WHERE template_id=?
                    """, actor, id);
            jdbc.update("DELETE FROM dbo.weekly_schedule_template_entries WHERE template_id=?", id);
        }
        for (var entry : input.entries()) {
            for (var day : entry.weekdays()) {
                jdbc.update("""
                        INSERT dbo.weekly_schedule_template_entries
                        (template_id,day_of_week,slot_number,class_name,sport_id,coach_id,room_id,max_capacity,required_access_level)
                        VALUES(?,?,?,?,?,?,?,?,?)
                        """, id, day.getValue(), Integer.parseInt(entry.slotCode().name().substring(5)),
                        entry.className().strip(), entry.sportId(), entry.coachId(), entry.roomId(),
                        entry.maxCapacity(), entry.accessLevel());
            }
        }
        return get();
    }

    @Transactional(readOnly = true)
    public WeeklyScheduleService.Preview preview(Window window) {
        return scheduling.preview(request(window));
    }

    @Transactional
    public WeeklyScheduleService.Confirmation confirm(Window window) {
        resources.lock();
        return scheduling.confirm(request(window));
    }

    private WeeklyScheduleService.Request request(Window window) {
        var template = get();
        requireVersion(window.version(), template);
        return new WeeklyScheduleService.Request(window.startDate(), window.weeks(), template.entries(),
                window.excludedKeys(), window.token());
    }

    private void requireVersion(long requested, Template current) {
        if (requested != current.version()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mẫu lịch đã thay đổi. Tải lại trang để xem bản mới.");
        }
    }
}
