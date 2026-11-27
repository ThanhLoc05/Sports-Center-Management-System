package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.ClassCancellationRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.service.WeeklyScheduleService.Entry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

import static com.sportscenter.management.service.FlexibleClassSlot.DURATION_MINUTES;
import static com.sportscenter.management.service.FlexibleClassSlot.ZONE;

/**
 * Áp dụng thay đổi của Lịch tuần mẫu vào lớp thực tế đã công bố.
 * Lớp thực tế của một ô mẫu được nhận ra qua recurring_class_sessions.recurrence_key (mã chuỗi của ô mẫu).
 * Chỉ chạy trong transaction của người gọi: xem trước thì rollback, lưu thì commit hoặc từ chối toàn bộ.
 */
@Service
@RequiredArgsConstructor
public class WeeklyScheduleSyncService {
    public enum Mode { TEMPLATE_ONLY, SELECTED_WEEK, FUTURE_PUBLISHED }
    public enum Action { CREATE, UPDATE, CANCEL, ORPHAN, MISSING, SKIP, CONFLICT }

    public record Change(Action action, LocalDate date, FlexibleClassSlot slotCode, String className,
                         Integer classId, String message, Long booked, Long waitlisted, String placementKey) {
        public Change(Action action, LocalDate date, FlexibleClassSlot slotCode, String className,
                      Integer classId, String message) {
            this(action, date, slotCode, className, classId, message, null, null, null);
        }
    }

    public record SyncPreview(Mode mode, List<Change> changes, String token) {}

    private record Placement(DayOfWeek day, String key) {}

    private record Row(DayOfWeek day, Entry entry) {
        String key() { return WeeklyScheduleService.seriesKey(entry); }
        Placement placement() { return new Placement(day, key()); }
    }

    private final ClassService classes;
    private final ClassRepository classRepository;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    @PersistenceContext
    private EntityManager entityManager;

    public List<Change> run(List<Entry> before, List<Entry> after, Mode mode, LocalDate weekStart) {
        return run(before, after, mode, weekStart, null);
    }

    public List<Change> run(List<Entry> before, List<Entry> after, Mode mode, LocalDate weekStart,
                            List<Integer> sourceIndices) {
        return run(before, after, mode, weekStart, sourceIndices, false, Set.of(), Set.of(), null);
    }

    public List<Change> run(List<Entry> before, List<Entry> after, Mode mode, LocalDate weekStart,
                            List<Integer> sourceIndices, boolean includeOrphans, Set<Integer> orphanIds,
                            Set<String> missingKeys, Integer actor) {
        if (mode == null || mode == Mode.TEMPLATE_ONLY) return List.of();
        LocalDateTime now = LocalDateTime.now(clock.withZone(ZONE));
        Set<LocalDate> dates = scope(mode, weekStart, now.toLocalDate());
        List<Row[]> edits = new ArrayList<>();
        List<Row> added = new ArrayList<>();
        if (sourceIndices == null) matchCells(before, after, edits, added);
        else matchEntries(before, after, sourceIndices, edits, added);
        List<Change> changes = new ArrayList<>();
        cancelRemoved(before, after, edits, dates, now, includeOrphans, orphanIds, actor, changes);
        for (Row[] edit : edits) update(edit[0], edit[1], dates, now, changes);
        for (Row row : added) create(row, dates, now, changes);
        if (includeOrphans) reconcileMissing(after, dates, now, missingKeys, changes);
        changes.sort(Comparator.comparing(Change::date).thenComparing(Change::slotCode, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Change::className));
        return List.copyOf(changes);
    }

    private void cancelRemoved(List<Entry> before, List<Entry> after, List<Row[]> edits, Set<LocalDate> dates,
                               LocalDateTime now, boolean includeOrphans, Set<Integer> orphanIds, Integer actor,
                               List<Change> changes) {
        Set<Placement> previous = placements(before);
        Set<Placement> remaining = placements(after);
        Set<Placement> removed = new HashSet<>(previous);
        removed.removeAll(remaining);
        edits.forEach(edit -> removed.remove(edit[0].placement()));
        Set<Integer> unresolved = new HashSet<>(orphanIds == null ? Set.of() : orphanIds);
        if ((!removed.isEmpty() || includeOrphans) && !dates.isEmpty()) {
            var links = jdbc.queryForList("""
                    SELECT r.recurrence_key, r.session_date, r.class_id
                    FROM dbo.recurring_class_sessions r JOIN dbo.classes c ON c.class_id=r.class_id
                    WHERE r.session_date BETWEEN ? AND ? AND c.status='SCHEDULED'
                    AND c.course_id IS NULL AND c.regular_class_id IS NULL AND c.schedule_time>?
                    ORDER BY r.session_date, r.class_id
                    """, dates.stream().min(LocalDate::compareTo).orElseThrow(),
                    dates.stream().max(LocalDate::compareTo).orElseThrow(), now);
            for (var link : links) {
                LocalDate date = ((java.sql.Date) link.get("session_date")).toLocalDate();
                if (!dates.contains(date)) continue;
                var key = new Placement(date.getDayOfWeek(), (String) link.get("recurrence_key"));
                boolean removedNow = removed.contains(key);
                boolean orphan = includeOrphans && !previous.contains(key) && !remaining.contains(key);
                if (!removedNow && !orphan) continue;
                int id = ((Number) link.get("class_id")).intValue();
                Classes actual = classRepository.findByIdForUpdate(id).orElse(null);
                if (actual == null || !"SCHEDULED".equals(actual.getStatus()) || !actual.getScheduleTime().isAfter(now)) continue;
                var slot = slotOf(actual);
                boolean matches = date.equals(actual.getScheduleTime().toLocalDate()) && key.key().equals(classKey(actual));
                if (!matches) {
                    if (removedNow) changes.add(new Change(Action.SKIP, date, slot,
                            actual.getClassName(), id, "Buổi đã được điều chỉnh riêng trong Lịch hoạt động."));
                    continue;
                }
                var details = classes.cancellationDetails(id, actor, true);
                if (!details.canCancel()) {
                    if (removedNow) changes.add(new Change(Action.SKIP, date, slot,
                            actual.getClassName(), id, "Buổi hiện không thể hủy theo quy định."));
                    continue;
                }
                boolean cancel = removedNow || unresolved.remove(id);
                changes.add(new Change(cancel ? Action.CANCEL : Action.ORPHAN, date, slot, actual.getClassName(), id,
                        null, details.booked(), details.waitlisted(), null));
                if (cancel) classes.cancelClass(id,
                        new ClassCancellationRequest(ClassCancellationRequest.Reason.SCHEDULE_CHANGE, null, null), actor);
            }
        }
        if (!unresolved.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Danh sách buổi không còn trong mẫu đã thay đổi. Vui lòng xem trước lại.");
    }

    private static Set<Placement> placements(List<Entry> entries) {
        Set<Placement> result = new HashSet<>();
        entries.forEach(entry -> entry.weekdays().forEach(day ->
                result.add(new Placement(day, WeeklyScheduleService.seriesKey(entry)))));
        return result;
    }

    private static void matchCells(List<Entry> before, List<Entry> after, List<Row[]> edits, List<Row> added) {
        Map<String, List<Row>> oldCells = cells(before);
        for (var cell : cells(after).entrySet()) {
            List<Row> olds = new ArrayList<>(oldCells.getOrDefault(cell.getKey(), List.of()));
            for (Row row : cell.getValue()) {
                Row match = olds.stream().filter(o -> o.entry().coachId() == row.entry().coachId()).findFirst()
                        .or(() -> olds.stream().filter(o -> o.entry().roomId() == row.entry().roomId()).findFirst())
                        .orElse(olds.size() == 1 && cell.getValue().size() == 1 ? olds.get(0) : null);
                if (match == null) {
                    added.add(row);
                    continue;
                }
                olds.remove(match);
                if (!match.key().equals(row.key())) edits.add(new Row[]{match, row});
            }
        }
    }

    private static void matchEntries(List<Entry> before, List<Entry> after, List<Integer> sourceIndices,
                                     List<Row[]> edits, List<Row> added) {
        if (sourceIndices.size() != after.size()) throw new IllegalArgumentException("Danh sách mục gốc không khớp lịch mẫu.");
        Set<Integer> matched = new HashSet<>();
        for (int i = 0; i < after.size(); i++) {
            Entry next = after.get(i);
            Integer source = sourceIndices.get(i);
            if (source == null) {
                next.weekdays().forEach(day -> added.add(new Row(day, next)));
                continue;
            }
            if (source < 0 || source >= before.size() || !matched.add(source)) {
                throw new IllegalArgumentException("Mục gốc trong lịch mẫu không hợp lệ.");
            }
            Entry previous = before.get(source);
            var removedDays = previous.weekdays().stream().filter(day -> !next.weekdays().contains(day)).toList();
            var addedDays = next.weekdays().stream().filter(day -> !previous.weekdays().contains(day)).toList();
            if (!removedDays.isEmpty() && !addedDays.isEmpty()) {
                if (removedDays.size() != 1 || addedDays.size() != 1) {
                    throw new IllegalArgumentException("Đổi từng ngày trong một lần đồng bộ để giữ đúng lớp đã công bố.");
                }
                edits.add(new Row[]{new Row(removedDays.getFirst(), previous), new Row(addedDays.getFirst(), next)});
            } else {
                addedDays.forEach(day -> added.add(new Row(day, next)));
            }
            if (!WeeklyScheduleService.seriesKey(previous).equals(WeeklyScheduleService.seriesKey(next))) {
                for (DayOfWeek day : next.weekdays()) {
                    if (previous.weekdays().contains(day)) edits.add(new Row[]{new Row(day, previous), new Row(day, next)});
                }
            }
        }
    }

    public static String token(List<Change> changes) {
        return digest(changes.toString());
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private Set<LocalDate> scope(Mode mode, LocalDate weekStart, LocalDate today) {
        Set<LocalDate> mondays = new TreeSet<>();
        if (mode == Mode.SELECTED_WEEK) {
            if (weekStart == null) throw new IllegalArgumentException("Chọn tuần cần áp dụng.");
            LocalDate monday = weekStart.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            if (monday.plusDays(6).isBefore(today)) throw new IllegalArgumentException("Tuần đã chọn đã qua.");
            mondays.add(monday);
        } else {
            jdbc.query("SELECT DISTINCT session_date FROM dbo.recurring_class_sessions WHERE session_date >= ?",
                    rs -> { mondays.add(rs.getObject(1, LocalDate.class)
                            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))); }, today);
        }
        Set<LocalDate> dates = new TreeSet<>();
        for (LocalDate monday : mondays) {
            for (int i = 0; i < 7; i++) {
                if (!monday.plusDays(i).isBefore(today)) dates.add(monday.plusDays(i));
            }
        }
        return dates;
    }

    private static Map<String, List<Row>> cells(List<Entry> entries) {
        Map<String, List<Row>> cells = new LinkedHashMap<>();
        for (Entry entry : entries) {
            for (DayOfWeek day : entry.weekdays()) {
                cells.computeIfAbsent(day + ":" + entry.slotCode(), key -> new ArrayList<>())
                        .add(new Row(day, new Entry(entry.className(), entry.sportId(), entry.coachId(), entry.roomId(),
                                entry.maxCapacity(), Set.of(day), entry.slotCode(), entry.requiredAccessLevel())));
            }
        }
        return cells;
    }

    private void update(Row from, Row to, Set<LocalDate> dates, LocalDateTime now, List<Change> changes) {
        String oldKey = from.key();
        String newKey = to.key();
        var sessions = jdbc.queryForList("""
                SELECT session_date, class_id FROM dbo.recurring_class_sessions
                WHERE recurrence_key=? ORDER BY session_date
                """, oldKey);
        for (var session : sessions) {
            LocalDate date = ((java.sql.Date) session.get("session_date")).toLocalDate();
            int classId = ((Number) session.get("class_id")).intValue();
            if (!dates.contains(date) || date.getDayOfWeek() != from.day()) continue;
            LocalDate target = date.plusDays(to.day().getValue() - from.day().getValue());
            Classes actual = classRepository.findById(classId).orElse(null);
            if (actual == null || !"SCHEDULED".equals(actual.getStatus())) {
                changes.add(change(Action.SKIP, date, to, classId, "Lớp đã hoàn thành hoặc đã hủy."));
            } else if (!actual.getScheduleTime().isAfter(now)) {
                changes.add(change(Action.SKIP, date, to, classId, "Lớp đã diễn ra."));
            } else if (!date.equals(actual.getScheduleTime().toLocalDate()) || !oldKey.equals(classKey(actual))) {
                changes.add(change(Action.SKIP, date, to, classId, "Lớp đã được điều chỉnh riêng trong Lịch hoạt động."));
            } else if ((from.entry().sportId() != to.entry().sportId()
                    || !from.entry().accessLevel().equals(to.entry().accessLevel()))
                    && classes.getCurrentBookingCount(classId) > 0) {
                changes.add(change(Action.CONFLICT, date, to, classId,
                        "Lớp đã có học viên đăng ký nên không đổi bộ môn hoặc cấp Membership."));
            } else if (!target.atTime(to.entry().slotCode().start()).isAfter(now)) {
                changes.add(change(Action.CONFLICT, target, to, classId, "Ca mới đã bắt đầu hoặc đã qua."));
            } else if (sessionExists(newKey, target)) {
                changes.add(change(Action.CONFLICT, target, to, classId, "Ngày này đã có lớp giống hệt lớp sau khi sửa."));
            } else {
                try {
                    classes.updateClass(classId, to.entry().requestOn(target));
                    if (target.equals(date)) {
                        jdbc.update("UPDATE dbo.recurring_class_sessions SET recurrence_key=? WHERE class_id=?", newKey, classId);
                    } else {
                        jdbc.update("UPDATE dbo.recurring_class_sessions SET recurrence_key=?, session_date=? WHERE class_id=?",
                                newKey, target, classId);
                    }
                    changes.add(change(Action.UPDATE, target, to, classId, null));
                } catch (IllegalArgumentException | ResponseStatusException invalid) {
                    entityManager.clear();
                    changes.add(change(Action.CONFLICT, target, to, classId, reason(invalid)));
                }
            }
        }
    }

    private void create(Row row, Set<LocalDate> dates, LocalDateTime now, List<Change> changes) {
        String key = row.key();
        for (LocalDate date : dates) {
            if (date.getDayOfWeek() != row.day() || !date.atTime(row.entry().slotCode().start()).isAfter(now)) continue;
            Integer cancelled = cancelledLink(key, date);
            if (cancelled == null && sessionExists(key, date)) {
                changes.add(change(Action.SKIP, date, row, null, "Đã có lớp này trong ngày."));
                continue;
            }
            createOne(row, date, cancelled, null, changes);
        }
    }

    private void reconcileMissing(List<Entry> entries, Set<LocalDate> dates, LocalDateTime now,
                                  Set<String> selected, List<Change> changes) {
        Set<String> unresolved = new HashSet<>(selected == null ? Set.of() : selected);
        for (var rows : cells(entries).values()) {
            for (Row row : rows) {
                for (LocalDate date : dates) {
                    if (date.getDayOfWeek() != row.day() || !date.atTime(row.entry().slotCode().start()).isAfter(now)
                            || sessionExists(row.key(), date)) continue;
                    String key = date + ":" + row.key();
                    if (unresolved.remove(key)) {
                        createOne(row, date, null, key, changes);
                    } else {
                        changes.add(new Change(Action.MISSING, date, row.entry().slotCode(), row.entry().className(),
                                null, null, null, null, key));
                    }
                }
            }
        }
        if (!unresolved.isEmpty()) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "Danh sách buổi còn thiếu đã thay đổi. Vui lòng xem trước lại.");
    }

    private Integer cancelledLink(String key, LocalDate date) {
        return jdbc.queryForList("""
                SELECT r.class_id FROM dbo.recurring_class_sessions r JOIN dbo.classes c ON c.class_id=r.class_id
                WHERE r.recurrence_key=? AND r.session_date=? AND c.status='CANCELLED'
                """, Integer.class, key, date).stream().findFirst().orElse(null);
    }

    private void createOne(Row row, LocalDate date, Integer cancelled, String placementKey, List<Change> changes) {
        try {
            var created = classes.createClass(row.entry().requestOn(date));
            if (cancelled != null) {
                jdbc.update("UPDATE dbo.recurring_class_sessions SET recurrence_key=? WHERE class_id=?",
                        digest("cancelled:" + row.key() + ":" + cancelled), cancelled);
            }
            jdbc.update("INSERT dbo.recurring_class_sessions(recurrence_key,session_date,class_id) VALUES(?,?,?)",
                    row.key(), date, created.getId());
            changes.add(new Change(Action.CREATE, date, row.entry().slotCode(), row.entry().className().strip(),
                    null, null, null, null, placementKey));
        } catch (IllegalArgumentException | ResponseStatusException invalid) {
            entityManager.clear();
            changes.add(new Change(Action.CONFLICT, date, row.entry().slotCode(), row.entry().className().strip(),
                    null, reason(invalid), null, null, placementKey));
        }
    }

    private boolean sessionExists(String key, LocalDate date) {
        Integer count = jdbc.queryForObject("""
                SELECT COUNT(*) FROM dbo.recurring_class_sessions WHERE recurrence_key=? AND session_date=?
                """, Integer.class, key, date);
        return count != null && count > 0;
    }

    private static FlexibleClassSlot slotOf(Classes actual) {
        return Arrays.stream(FlexibleClassSlot.values())
                .filter(s -> s.start().equals(actual.getScheduleTime().toLocalTime())).findFirst().orElse(null);
    }

    private static String classKey(Classes actual) {
        if (!Objects.equals(actual.getDurationMinutes(), DURATION_MINUTES)) return null;
        var slot = slotOf(actual);
        if (slot == null) return null;
        return WeeklyScheduleService.seriesKey(new Entry(actual.getClassName(), actual.getSportId(), actual.getCoachId(),
                actual.getRoomId(), actual.getMaxCapacity(), Set.of(actual.getScheduleTime().getDayOfWeek()), slot,
                actual.getRequiredAccessLevel()));
    }

    private static Change change(Action action, LocalDate date, Row row, Integer classId, String message) {
        return new Change(action, date, row.entry().slotCode(), row.entry().className().strip(), classId, message);
    }

    private static String reason(RuntimeException invalid) {
        return invalid instanceof ResponseStatusException status && status.getReason() != null
                ? status.getReason() : invalid.getMessage();
    }
}
