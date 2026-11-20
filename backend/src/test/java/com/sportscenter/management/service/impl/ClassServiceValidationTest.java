package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.RoomRepository;
import com.sportscenter.management.repository.SportRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.MemberClassNotifications;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import jakarta.persistence.EntityManager;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class ClassServiceValidationTest {
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final SportRepository sports = mock(SportRepository.class);
    private final RoomRepository rooms = mock(RoomRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final MemberClassNotifications notifications = mock(MemberClassNotifications.class);
    private final ClassServiceImpl service = new ClassServiceImpl(classes, bookings, sports, rooms, users, notifications);

    @BeforeEach
    void injectPersistenceContext() {
        ReflectionTestUtils.setField(service, "entityManager", mock(EntityManager.class));
        when(classes.findByIdForUpdate(anyInt())).thenAnswer(call -> classes.findById(call.getArgument(0)));
    }

    @Test
    void updateRejectsCapacityAboveExistingRoomWhenRoomIsUnchanged() {
        Classes existing = Classes.builder()
                .id(1).className("Yoga").sportId(1).coachId(5).roomId(2)
                .maxCapacity(8).scheduleTime(LocalDateTime.now().plusDays(1))
                .durationMinutes(60).requiredAccessLevel("STANDARD").status("SCHEDULED")
                .build();
        when(classes.findById(1)).thenReturn(Optional.of(existing));
        when(bookings.countByClassIdAndStatus(1, "BOOKED")).thenReturn(3L);
        when(rooms.findById(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        ClassRequest request = ClassRequest.builder().maxCapacity(11).build();

        assertThrows(IllegalArgumentException.class, () -> service.updateClass(1, request));
        verify(classes, never()).save(any());
    }

    @Test
    void createRejectsInactiveCoach() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(User.builder()
                .id(5)
                .role(Role.builder().roleName("COACH").build())
                .status("BLOCKED")
                .build()));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(LocalDateTime.now().plusDays(1))
                .build();

        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));

        verify(rooms, never()).findByIdForUpdate(any());
        verify(classes, never()).save(any());
    }

    @Test
    void createRejectsOverlappingScheduleOnSameCoach() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(classes.findPotentialScheduleConflicts(eq(5), eq(2), any()))
                .thenReturn(List.of(Classes.builder()
                        .id(9)
                        .className("Pilates")
                        .coachId(5)
                        .roomId(3)
                        .scheduleTime(LocalDateTime.now().plusDays(1).withHour(10))
                        .durationMinutes(60)
                        .status("SCHEDULED")
                        .build()));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(LocalDateTime.now().plusDays(1).withHour(10).plusMinutes(30))
                .build();

        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));

        verify(classes, never()).save(any());
    }

    @Test
    void createUsesResourceLocksBeforeCheckingConflicts() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(classes.findPotentialScheduleConflicts(eq(5), eq(2), any())).thenReturn(List.of());
        when(classes.save(any(Classes.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(LocalDateTime.now().plusDays(1))
                .build();

        service.createClass(request);

        var order = inOrder(users, rooms, classes);
        order.verify(users).findByIdForUpdate(5);
        order.verify(rooms).findByIdForUpdate(2);
        order.verify(classes).findPotentialScheduleConflicts(eq(5), eq(2), any());
    }

    private Classes scheduledClass(LocalDateTime start) {
        var row = Classes.builder().id(1).className("Yoga").sportId(1).coachId(5).roomId(2)
                .maxCapacity(8).scheduleTime(start).durationMinutes(60).status("SCHEDULED").build();
        when(classes.findById(1)).thenReturn(Optional.of(row));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(classes.save(row)).thenReturn(row);
        return row;
    }

    @Test
    void rejectsDurationConflictBeforeMutatingOrPublishing() {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Classes row = scheduledClass(start);
        when(bookings.findBookedMemberIds(1)).thenReturn(List.of(17, 21));
        when(bookings.hasMemberScheduleConflict(1, start, start.plusMinutes(90))).thenReturn(true);

        var conflict = assertThrows(ResponseStatusException.class, () -> service.updateClass(1,
                ClassRequest.builder().className("Renamed").durationMinutes(90).build()));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(60, row.getDurationMinutes());
        assertEquals("Yoga", row.getClassName());
        var order = inOrder(classes, users, bookings);
        order.verify(classes).findByIdForUpdate(1);
        order.verify(users).findByIdForUpdate(17);
        order.verify(users).findByIdForUpdate(21);
        order.verify(bookings).hasMemberScheduleConflict(1, start, start.plusMinutes(90));
        verify(classes, never()).save(any());
        verifyNoInteractions(notifications);
    }

    @Test
    void unchangedIntervalCanUpdateDetailsWithoutRevalidatingExistingMemberBookings() {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        scheduledClass(start);
        var updated = service.updateClass(1, ClassRequest.builder()
                .className("Renamed").scheduleTime(start).durationMinutes(60).build());
        assertEquals("Renamed", updated.getClassName());
        verify(bookings, never()).findBookedMemberIds(anyInt());
        verify(bookings, never()).hasMemberScheduleConflict(anyInt(), any(), any());
    }

    private User activeCoach(int id) {
        return User.builder()
                .id(id)
                .role(Role.builder().roleName("COACH").build())
                .status("ACTIVE")
                .build();
    }
}
