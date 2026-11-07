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
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class ClassServiceValidationTest {
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final SportRepository sports = mock(SportRepository.class);
    private final RoomRepository rooms = mock(RoomRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ClassServiceImpl service =
            new ClassServiceImpl(classes, bookings, sports, rooms, users);

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

    private User activeCoach(int id) {
        return User.builder()
                .id(id)
                .role(Role.builder().roleName("COACH").build())
                .status("ACTIVE")
                .build();
    }
}
