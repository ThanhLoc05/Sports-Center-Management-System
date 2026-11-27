package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.service.WeeklyScheduleService.Entry;
import com.sportscenter.management.service.WeeklyScheduleSyncService.Action;
import com.sportscenter.management.service.WeeklyScheduleSyncService.Mode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.sql.Date;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WeeklyScheduleSyncServiceTest {
    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 30);
    private final ClassService classes = mock(ClassService.class);
    private final ClassRepository repository = mock(ClassRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final WeeklyScheduleSyncService sync = new WeeklyScheduleSyncService(classes, repository, jdbc,
            Clock.fixed(Instant.parse("2026-11-25T23:00:00Z"), ZoneOffset.UTC));

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(sync, "entityManager", mock(EntityManager.class));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any(), any())).thenReturn(0);
    }

    @Test
    void templateOnlyChangesNothing() {
        assertTrue(sync.run(List.of(entry("Yoga", 2, 3)), List.of(entry("Yoga mới", 2, 3)), Mode.TEMPLATE_ONLY, MONDAY).isEmpty());
        verify(classes, never()).updateClass(any(), any());
    }

    @Test
    void editedEntryUpdatesTheSamePublishedClassAndKeepsItsId() {
        var old = entry("Yoga", 2, 3);
        published(old, 41, classOf(old, 41));
        var changes = sync.run(List.of(old), List.of(entry("Yoga sáng", 2, 3)), Mode.SELECTED_WEEK, MONDAY);
        assertEquals(List.of(Action.UPDATE), changes.stream().map(WeeklyScheduleSyncService.Change::action).toList());
        verify(classes).updateClass(eq(41), any(ClassRequest.class));
        verify(jdbc).update(anyString(), eq(WeeklyScheduleService.seriesKey(entry("Yoga sáng", 2, 3))), eq(41));
    }

    @Test
    void individuallyAdjustedClassIsNotOverwritten() {
        var old = entry("Yoga", 2, 3);
        var adjusted = classOf(old, 41);
        adjusted.setMaxCapacity(5);
        published(old, 41, adjusted);
        var changes = sync.run(List.of(old), List.of(entry("Yoga sáng", 2, 3)), Mode.SELECTED_WEEK, MONDAY);
        assertEquals(Action.SKIP, changes.get(0).action());
        verify(classes, never()).updateClass(any(), any());
    }

    @Test
    void levelChangeWithBookedMembersIsRejected() {
        var old = entry("Yoga", 2, 3);
        published(old, 41, classOf(old, 41));
        when(classes.getCurrentBookingCount(41)).thenReturn(2L);
        var vip = new Entry("Yoga", 1, 2, 3, 8, Set.of(DayOfWeek.MONDAY), FlexibleClassSlot.SLOT_05, "VIP");
        var changes = sync.run(List.of(old), List.of(vip), Mode.SELECTED_WEEK, MONDAY);
        assertEquals(Action.CONFLICT, changes.get(0).action());
        verify(classes, never()).updateClass(any(), any());
    }

    @Test
    void newEntryIsPublishedIntoTheSelectedWeekOnly() {
        when(classes.createClass(any())).thenReturn(ClassResponse.builder().id(77).build());
        var changes = sync.run(List.of(), List.of(entry("Pilates", 4, 5)), Mode.SELECTED_WEEK, MONDAY);
        assertEquals(1, changes.size());
        assertEquals(Action.CREATE, changes.get(0).action());
        assertEquals(MONDAY, changes.get(0).date());
    }

    @Test
    void resourceConflictOnCreateIsReported() {
        when(classes.createClass(any())).thenThrow(new IllegalArgumentException("HLV đã có lớp trong khung giờ này"));
        var changes = sync.run(List.of(), List.of(entry("Pilates", 4, 5)), Mode.SELECTED_WEEK, MONDAY);
        assertEquals(Action.CONFLICT, changes.get(0).action());
        assertEquals("HLV đã có lớp trong khung giờ này", changes.get(0).message());
    }

    private void published(Entry entry, int classId, Classes actual) {
        when(jdbc.queryForList(anyString(), eq(WeeklyScheduleService.seriesKey(entry))))
                .thenReturn(List.of(Map.of("session_date", Date.valueOf(MONDAY), "class_id", classId)));
        when(repository.findById(classId)).thenReturn(Optional.of(actual));
    }

    private static Entry entry(String name, int coach, int room) {
        return new Entry(name, 1, coach, room, 8, Set.of(DayOfWeek.MONDAY), FlexibleClassSlot.SLOT_05, null);
    }

    private static Classes classOf(Entry entry, int id) {
        return Classes.builder().id(id).className(entry.className()).sportId(entry.sportId())
                .coachId(entry.coachId()).roomId(entry.roomId()).maxCapacity(entry.maxCapacity())
                .scheduleTime(MONDAY.atTime(entry.slotCode().start())).durationMinutes(90)
                .requiredAccessLevel("STANDARD").status("SCHEDULED").build();
    }
}
