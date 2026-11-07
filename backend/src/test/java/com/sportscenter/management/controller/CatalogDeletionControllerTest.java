package com.sportscenter.management.controller;

import com.sportscenter.management.entity.Room;
import com.sportscenter.management.entity.Sport;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.RoomRepository;
import com.sportscenter.management.repository.SportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogDeletionControllerTest {

    @Test
    void deletesRoomWithoutClassReferences() {
        RoomRepository rooms = mock(RoomRepository.class);
        ClassRepository classes = mock(ClassRepository.class);
        when(rooms.findById(2)).thenReturn(Optional.of(Room.builder().id(2).build()));
        when(classes.existsByRoomId(2)).thenReturn(false);

        var response = new RoomController(rooms, classes).deleteRoom(2);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(rooms).delete(any(Room.class));
    }

    @Test
    void rejectsDeletingRoomReferencedByAClass() {
        RoomRepository rooms = mock(RoomRepository.class);
        ClassRepository classes = mock(ClassRepository.class);
        when(rooms.findById(2)).thenReturn(Optional.of(Room.builder().id(2).build()));
        when(classes.existsByRoomId(2)).thenReturn(true);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> new RoomController(rooms, classes).deleteRoom(2));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(rooms, never()).delete(any(Room.class));
    }

    @Test
    void deletesSportWithoutClassReferences() {
        SportRepository sports = mock(SportRepository.class);
        ClassRepository classes = mock(ClassRepository.class);
        when(sports.findById(3)).thenReturn(Optional.of(Sport.builder().id(3).build()));
        when(classes.existsBySportId(3)).thenReturn(false);

        var response = new SportController(sports, classes).deleteSport(3);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        verify(sports).delete(any(Sport.class));
    }

    @Test
    void rejectsDeletingSportReferencedByAClass() {
        SportRepository sports = mock(SportRepository.class);
        ClassRepository classes = mock(ClassRepository.class);
        when(sports.findById(3)).thenReturn(Optional.of(Sport.builder().id(3).build()));
        when(classes.existsBySportId(3)).thenReturn(true);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class,
                () -> new SportController(sports, classes).deleteSport(3));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(sports, never()).delete(any(Sport.class));
    }
}
