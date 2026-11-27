package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.training.TrainingPolicy;
import com.sportscenter.management.training.TrainingProgramService;
import com.sportscenter.management.training.TrainingProgramService.RegularReservation;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static com.sportscenter.management.service.FlexibleClassSlot.DURATION_MINUTES;
import static com.sportscenter.management.service.FlexibleClassSlot.ZONE;

@Service
@RequiredArgsConstructor
public class WeeklyScheduleService {
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/uuuu");
    private static final Set<Integer> WEEK_OPTIONS = Set.of(1, 2, 4, 8, 12);

    private final ClassService classes;
    private final ClassRepository classRepository;
    private final TrainingProgramService trainingPrograms;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public record Entry(@NotBlank @Size(max = 150) String className, @Positive int sportId,
                        @Positive int coachId, @Positive int roomId, @Positive int maxCapacity,
                        @NotEmpty Set<@NotNull DayOfWeek> weekdays, @NotNull FlexibleClassSlot slotCode,
                        @Pattern(regexp = "STANDARD|VIP") String requiredAccessLevel) {
        String accessLevel() {
            return requiredAccessLevel == null ? "STANDARD" : requiredAccessLevel;
        }

        ClassRequest requestOn(LocalDate day) {
            return ClassRequest.builder().className(className.strip()).sportId(sportId)
                    .coachId(coachId).roomId(roomId).maxCapacity(maxCapacity).requiredAccessLevel(accessLevel())
                    .scheduleTime(day.atTime(slotCode.start())).durationMinutes(DURATION_MINUTES).build();
        }
    }

    public record Request(@NotNull LocalDate startDate, int weeks,
                          @NotEmpty @Size(max = 100) List<@NotNull @Valid Entry> entries,
                          @Size(max = 8400) Set<@NotBlank String> excludedKeys, String token) {}

    public enum Status { READY, EXISTS, CONFLICT, EXCLUDED }

    public record Occurrence(String key, Status status, LocalDate date, FlexibleClassSlot slotCode,
                             String className, int sportId, int coachId, int roomId, int maxCapacity,
                             String message, Integer classId) {}

    public record Preview(LocalDate startDate, LocalDate endDate, List<Occurrence> occurrences, String token) {}

    public record Confirmation(int created, int alreadyExisted, int excluded, LocalDate startDate, LocalDate endDate) {}

    private record Candidate(String seriesKey, LocalDate date, Entry entry, String invalidReason) {
        String key() { return seriesKey + ":" + date; }
        LocalDateTime start() { return date.atTime(entry.slotCode().start()); }
        LocalDateTime end() { return date.atTime(entry.slotCode().end()); }

        Occurrence occurrence(Status status, String reason, Integer classId) {
            return new Occurrence(key(), status, date, entry.slotCode(), entry.className().strip(),
                    entry.sportId(), entry.coachId(), entry.roomId(), entry.maxCapacity(), reason, classId);
        }
    }

    private record Plan(LocalDate start, LocalDate end, Map<String, Candidate> candidates, List<Occurrence> occurrences) {
        Preview preview() {
            return new Preview(start, end, occurrences, digest(start + "|" + end + "|" + occurrences));
        }
    }

    @Transactional(readOnly = true)
    public Preview preview(Request request) {
        return plan(request).preview();
    }

    @Transactional
    public Confirmation confirm(Request request) {
        if (request.token() == null || request.token().isBlank()) {
            throw new IllegalArgumentException("Hãy xem trước lịch trước khi xác nhận.");
        }
        // This transaction-owned lock is also taken by single-session, regular and course writes.
        trainingPrograms.lock();
        Plan plan = plan(request);
        var blocked = plan.occurrences().stream().filter(row -> row.status() == Status.CONFLICT).findFirst();
        if (blocked.isPresent()) {
            var row = blocked.get();
            throw conflict("Ngày " + DATE.format(row.date()) + ", " + row.slotCode().start() + ": " + row.message());
        }
        var ready = plan.occurrences().stream().filter(row -> row.status() == Status.READY).toList();
        int existing = (int) plan.occurrences().stream().filter(row -> row.status() == Status.EXISTS).count();
        int excluded = (int) plan.occurrences().stream().filter(row -> row.status() == Status.EXCLUDED).count();
        // Retrying a successful request with its old token becomes a no-op.
        if (!ready.isEmpty() && !request.token().equals(plan.preview().token())) {
            throw conflict("Lịch đã thay đổi từ lần xem trước. Vui lòng xem trước lại.");
        }
        for (var row : ready) {
            var candidate = plan.candidates().get(row.key());
            try {
                var created = classes.createClass(candidate.entry().requestOn(row.date()));
                jdbc.update("INSERT dbo.recurring_class_sessions(recurrence_key,session_date,class_id) VALUES(?,?,?)",
                        candidate.seriesKey(), row.date(), created.getId());
            } catch (IllegalArgumentException invalid) {
                throw conflict("Ngày " + DATE.format(row.date()) + ", " + row.slotCode().start() + ": " + invalid.getMessage());
            }
        }
        return new Confirmation(ready.size(), existing, excluded, plan.start(), plan.end());
    }

    private Plan plan(Request request) {
        var now = LocalDateTime.now(clock.withZone(ZONE));
        LocalDate start = request.startDate();
        if (!WEEK_OPTIONS.contains(request.weeks()) || start == null || start.isBefore(now.toLocalDate())
                || start.getYear() > 9998 || request.entries() == null || request.entries().isEmpty()) {
            throw new IllegalArgumentException("Chọn lịch mẫu, ngày bắt đầu từ hôm nay và số tuần hợp lệ.");
        }
        LocalDate end = start.plusDays(7L * request.weeks() - 1);
        Map<String, Candidate> candidates = candidates(request, start, end);
        Set<String> excluded = request.excludedKeys() == null ? Set.of() : request.excludedKeys();
        if (!candidates.keySet().containsAll(excluded)) {
            throw new IllegalArgumentException("Danh sách loại trừ không khớp các buổi trong lịch mẫu.");
        }

        var stored = classRepository.findScheduledOverlaps(start.atStartOfDay(), end.plusDays(1).atStartOfDay());
        var regular = trainingPrograms.activeRegularReservations();
        Map<String, Integer> posted = new HashMap<>();
        jdbc.query("""
                SELECT recurrence_key, session_date, class_id FROM dbo.recurring_class_sessions
                WHERE session_date >= ? AND session_date <= ?
                """, row -> {
            posted.put(row.getString(1) + ":" + row.getObject(2, LocalDate.class), row.getInt(3));
        }, start, end);

        var sorted = candidates.values().stream().sorted(Comparator.comparing(Candidate::start)
                .thenComparing(c -> c.entry().className()).thenComparing(Candidate::key)).toList();
        var byStart = sorted.stream().collect(Collectors.groupingBy(Candidate::start));
        List<Occurrence> occurrences = new ArrayList<>();
        for (var session : sorted) {
            var row = classify(session, now, excluded, posted, stored, regular);
            if (row.status() == Status.READY) {
                for (var other : byStart.get(session.start())) {
                    if (other == session || excluded.contains(other.key())
                            || posted.containsKey(other.key()) || other.invalidReason() != null) continue;
                    String resource = sharedResource(session.entry(), other.entry().coachId(), other.entry().roomId());
                    if (resource != null) {
                        row = session.occurrence(Status.CONFLICT, resource + " trùng trong tuần mẫu với lớp “"
                                + other.entry().className().strip() + "”.", null);
                        break;
                    }
                }
            }
            occurrences.add(row);
        }
        return new Plan(start, end, candidates, List.copyOf(occurrences));
    }

    private Map<String, Candidate> candidates(Request request, LocalDate start, LocalDate end) {
        Map<String, Candidate> candidates = new LinkedHashMap<>();
        for (var entry : request.entries()) {
            String reason = null;
            try {
                classes.validatePlanningResources(entry.requestOn(start));
            } catch (IllegalArgumentException invalid) {
                reason = invalid.getMessage();
            }
            // A series keeps its identity across overlapping planning periods and exclusion changes.
            String series = seriesKey(entry);
            for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
                if (!entry.weekdays().contains(day.getDayOfWeek())) continue;
                var candidate = new Candidate(series, day, entry, reason);
                if (candidates.putIfAbsent(candidate.key(), candidate) != null) {
                    throw new IllegalArgumentException("Một lớp bị lặp trong lịch mẫu ngày " + DATE.format(day) + ".");
                }
            }
        }
        return candidates;
    }

    private Occurrence classify(Candidate session, LocalDateTime now, Set<String> excluded,
                                Map<String, Integer> posted, List<Classes> stored, List<RegularReservation> regular) {
        if (excluded.contains(session.key())) return session.occurrence(Status.EXCLUDED, null, null);
        Integer publishedId = posted.get(session.key());
        if (publishedId != null) return session.occurrence(Status.EXISTS, null, publishedId);
        Entry entry = session.entry();
        for (var actual : stored) {
            if (exactSession(session, actual)) return session.occurrence(Status.EXISTS, null, actual.getId());
        }
        if (session.invalidReason() != null) return session.occurrence(Status.CONFLICT, session.invalidReason(), null);
        if (!session.start().isAfter(now)) {
            return session.occurrence(Status.CONFLICT, "Ca đã bắt đầu hoặc đã qua.", null);
        }
        for (var actual : stored) {
            String resource = sharedResource(entry, actual.getCoachId(), actual.getRoomId());
            int duration = actual.getDurationMinutes() == null ? 60 : actual.getDurationMinutes();
            if (resource != null && TrainingPolicy.overlaps(session.start(), session.end(), actual.getScheduleTime(),
                    actual.getScheduleTime().plusMinutes(duration))) {
                return session.occurrence(Status.CONFLICT, resource + " trùng với buổi “" + actual.getClassName() + "”.", actual.getId());
            }
        }
        for (var reservation : regular) {
            String resource = sharedResource(entry, reservation.coachId(), reservation.roomId());
            if (reservation.weekday() == session.date().getDayOfWeek().getValue() && resource != null
                    && TrainingPolicy.overlaps(session.start(), session.end(), session.date().atTime(reservation.start()),
                    session.date().atTime(reservation.end()))) {
                return session.occurrence(Status.CONFLICT, resource + " trùng với lớp theo lịch cố định “"
                        + reservation.name() + "”.", null);
            }
        }
        return session.occurrence(Status.READY, null, null);
    }

    private static boolean exactSession(Candidate candidate, Classes actual) {
        Entry entry = candidate.entry();
        return actual.getCourseId() == null && actual.getRegularClassId() == null
                && actual.getScheduleTime().equals(candidate.start()) && Objects.equals(actual.getDurationMinutes(), DURATION_MINUTES)
                && actual.getSportId() == entry.sportId() && actual.getCoachId() == entry.coachId()
                && actual.getRoomId() == entry.roomId() && actual.getMaxCapacity() == entry.maxCapacity()
                && Objects.equals(actual.getClassName(), entry.className().strip())
                && Objects.equals(actual.getRequiredAccessLevel(), entry.accessLevel());
    }

    static String seriesKey(Entry entry) {
        return digest(String.join("|", entry.className().strip(), String.valueOf(entry.sportId()),
                String.valueOf(entry.coachId()), String.valueOf(entry.roomId()), String.valueOf(entry.maxCapacity()),
                entry.slotCode().name(), entry.accessLevel()));
    }

    private static String sharedResource(Entry entry, int coachId, int roomId) {
        if (entry.coachId() == coachId) {
            return entry.roomId() == roomId ? "HLV và sân/phòng" : "HLV";
        }
        return entry.roomId() == roomId ? "Sân/phòng" : null;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
