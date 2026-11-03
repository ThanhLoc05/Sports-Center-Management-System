package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Room;
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
        when(classes.findAll()).thenReturn(List.of());
        ClassRequest request = ClassRequest.builder().maxCapacity(11).build();

        assertThrows(IllegalArgumentException.class, () -> service.updateClass(1, request));
        verify(classes, never()).save(any());
    }
}
