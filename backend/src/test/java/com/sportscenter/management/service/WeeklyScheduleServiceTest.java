package com.sportscenter.management.service;

import com.sportscenter.management.controller.RecurringClassController;
import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.training.TrainingProgramService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static com.sportscenter.management.service.FlexibleClassSlot.*;
import static com.sportscenter.management.service.WeeklyScheduleService.Status.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WeeklyScheduleServiceTest {
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 30);
    private final ClassService classes = mock(ClassService.class);
    private final ClassRepository repository = mock(ClassRepository.class);
    private final TrainingProgramService programs = mock(TrainingProgramService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final List<Classes> scheduled = new ArrayList<>();
    private final WeeklyScheduleService service = new WeeklyScheduleService(classes, repository, programs, jdbc,
            Clock.fixed(Instant.parse("2026-11-25T23:00:00Z"), ZoneOffset.UTC));

    @BeforeEach
    void existingSchedule() {
        when(repository.findScheduledOverlaps(any(), any())).thenReturn(scheduled);
    }

    @Test
    void directPublicationRequiresPreviewAndMakesNoChanges() {
        var legacy = mock(RecurringClassService.class);
        var planner = mock(WeeklyScheduleService.class);
        var controller = new RecurringClassController(legacy, planner);
        assertEquals(409, assertThrows(ResponseStatusException.class, controller::requirePreview)
                .getStatusCode().value());
        verifyNoInteractions(legacy, planner);
    }

    @Test
    void officialSlotsHaveExactlyTheApprovedNinetyMinuteIntervals() {
        assertEquals(List.of("06:00", "08:00", "15:00", "16:30", "18:00", "19:30"),
                Arrays.stream(FlexibleClassSlot.values()).map(slot -> slot.start().toString()).toList());
        for (var slot : FlexibleClassSlot.values()) {
            assertEquals(90, Duration.between(slot.start(), slot.end()).toMinutes());
            assertDoesNotThrow(() -> requireScheduledSlot(MONDAY.atTime(slot.start()), 90));
        }
        assertThrows(IllegalArgumentException.class, () -> requireScheduledSlot(MONDAY.atTime(18, 0), 60));
        assertThrows(IllegalArgumentException.class, () -> requireScheduledSlot(MONDAY.atTime(18, 30), 90));
    }

    @Test
    void fourWeeksExpandSelectedDaysWithoutWrites() {
        var entry = new WeeklyScheduleService.Entry("Badminton", 1, 2, 3, 8,
                Set.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY), SLOT_05, null);
        var result = service.preview(new WeeklyScheduleService.Request(MONDAY, 4, List.of(entry), null, null));
        assertEquals(MONDAY.plusDays(27), result.endDate());
        assertEquals(12, result.occurrences().size());
        assertTrue(result.occurrences().stream().allMatch(row -> row.status() == READY));
        verify(classes, never()).createClass(any());
        verify(programs, never()).lock();
        verify(jdbc, never()).update(anyString(), any(), any(), any());
    }

    @Test
    void currentDateUsesVietnamAndElapsedSlotIsExplicitlyBlocked() {
        LocalDate thursday = LocalDate.of(2026, 11, 26);
        var input = new WeeklyScheduleService.Request(thursday, 1,
                List.of(entry("早", 10, 2, SLOT_01, DayOfWeek.THURSDAY),
                        entry("Yoga", 10, 2, SLOT_02, DayOfWeek.THURSDAY)), null, null);
        assertEquals(List.of(CONFLICT, READY), service.preview(input).occurrences().stream()
                .map(WeeklyScheduleService.Occurrence::status).toList());
        assertThrows(IllegalArgumentException.class, () -> service.preview(
                new WeeklyScheduleService.Request(thursday.minusDays(1), 1, input.entries(), null, null)));
    }

    @Test
    void templateResourceConflictsCanBeExcludedAndAdjacentSlotsRemainReady() {
        var first = entry("A", 2, 3, SLOT_03, DayOfWeek.MONDAY);
        var sameCoach = entry("B", 2, 4, SLOT_03, DayOfWeek.MONDAY);
        var adjacent = entry("C", 2, 3, SLOT_04, DayOfWeek.MONDAY);
        var parallel = entry("D", 9, 8, SLOT_03, DayOfWeek.MONDAY);
        var input = List.of(first, sameCoach, adjacent, parallel);
        var firstPreview = service.preview(request(input, null, null));
        assertEquals(List.of(CONFLICT, CONFLICT, READY, READY), firstPreview.occurrences().stream()
                .map(WeeklyScheduleService.Occurrence::status).toList());
        String blocked = firstPreview.occurrences().get(1).key();
        var edited = service.preview(request(input, Set.of(blocked), null));
        assertEquals(List.of(READY, EXCLUDED, READY, READY), edited.occurrences().stream()
                .map(WeeklyScheduleService.Occurrence::status).toList());
    }

    @Test
    void legacySessionsCourseSessionsAndRegularReservationsBlockOnlySharedResources() {
        scheduled.add(scheduled("Outside of slot", 2, 5, LocalTime.of(14, 50), 30));
        var course = scheduled("Course", 8, 4, LocalTime.of(18, 5), 60);
        course.setCourseId(61);
        scheduled.add(course);
        when(programs.activeRegularReservations()).thenReturn(List.of(new TrainingProgramService.RegularReservation(
                "Recurring regular", 1, LocalTime.of(16, 20), LocalTime.of(17, 0), 9, 9)));
        var input = List.of(entry("A", 2, 3, SLOT_03, DayOfWeek.MONDAY),
                entry("B", 3, 4, SLOT_05, DayOfWeek.MONDAY), entry("C", 9, 8, SLOT_04, DayOfWeek.MONDAY));
        var result = service.preview(request(input, null, null)).occurrences();
        assertTrue(result.stream().allMatch(row -> row.status() == CONFLICT));
        assertTrue(result.get(0).message().contains("Outside of slot"));
        assertTrue(result.get(1).message().contains("Recurring regular"));
        assertTrue(result.get(2).message().contains("Course"));
    }

    @Test
    void confirmationRechecksAvailabilityAndRetryDoesNotPublishAgain() {
        var input = List.of(entry("A", 2, 3, SLOT_05, DayOfWeek.MONDAY));
        var preview = service.preview(request(input, null, null));
        scheduled.add(scheduled("New conflict", 7, 3, LocalTime.of(18, 15), 45));
        var confirmed = request(input, null, preview.token());
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> service.confirm(confirmed))
                .getStatusCode().value());
        verify(classes, never()).createClass(any());

        scheduled.clear();
        when(classes.createClass(any())).thenAnswer(call -> {
            ClassRequest saved = call.getArgument(0);
            var row = scheduled(saved.getClassName(), saved.getCoachId(), saved.getRoomId(),
                    saved.getScheduleTime().toLocalTime(), saved.getDurationMinutes());
            scheduled.add(row);
            return ClassResponse.builder().id(row.getId()).build();
        });
        assertEquals(1, service.confirm(confirmed).created());
        var retry = service.confirm(confirmed);
        assertEquals(0, retry.created());
        assertEquals(1, retry.alreadyExisted());
        verify(classes, times(1)).createClass(any());
        verify(jdbc, times(1)).update(contains("recurring_class_sessions"), anyString(), eq(MONDAY), eq(1));
    }

    private static WeeklyScheduleService.Request request(List<WeeklyScheduleService.Entry> input,
                                                          Set<String> excluded, String token) {
        return new WeeklyScheduleService.Request(MONDAY, 1, input, excluded, token);
    }

    private static WeeklyScheduleService.Entry entry(String name, int coach, int room,
                                                     FlexibleClassSlot slot, DayOfWeek day) {
        return new WeeklyScheduleService.Entry(name, 1, coach, room, 8, Set.of(day), slot, null);
    }

    private static Classes scheduled(String name, int coach, int room, LocalTime time, int duration) {
        return Classes.builder().id(1).className(name).sportId(1).coachId(coach).roomId(room)
                .maxCapacity(8).scheduleTime(MONDAY.atTime(time)).durationMinutes(duration)
                .requiredAccessLevel("STANDARD").status("SCHEDULED").build();
    }
}
