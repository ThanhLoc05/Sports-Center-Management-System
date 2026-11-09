package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.RoomRequest;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.RoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class RoomCapacityTest {
    private final RoomRepository rooms = mock(RoomRepository.class);
    private final ClassRepository classes = mock(ClassRepository.class);
    private final RoomController controller = new RoomController(rooms, classes);
    private final Room room = Room.builder().id(5).roomName("Original").capacity(3).build();

    private RoomRequest request(int capacity) {
        return RoomRequest.builder().roomName("Edited").capacity(capacity).build();
    }
    private void existingRoom() {
        when(rooms.findByIdForUpdate(5)).thenReturn(Optional.of(room));
    }

    @Test void rejectsShrinkWithoutChangingNameOrCapacity() {
        existingRoom();
        when(classes.existsByRoomIdAndStatusAndScheduleTimeAfterAndMaxCapacityGreaterThan(
                eq(5), eq("SCHEDULED"), any(), eq(1))).thenReturn(true);
        var error = assertThrows(ResponseStatusException.class, () -> controller.updateRoom(5, request(1)));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertEquals(3, room.getCapacity());
        assertEquals("Original", room.getRoomName());
        verify(rooms, never()).save(any());
    }
    @Test void allowsCapacityEqualToLargestFutureClass() {
        existingRoom();
        when(rooms.save(room)).thenReturn(room);
        assertEquals(2, controller.updateRoom(5, request(2)).getBody().getCapacity());
        verify(classes).existsByRoomIdAndStatusAndScheduleTimeAfterAndMaxCapacityGreaterThan(
                eq(5), eq("SCHEDULED"), any(), eq(2));
    }
    @Test void allowsIncrease() {
        existingRoom();when(rooms.save(room)).thenReturn(room);
        assertEquals(4, controller.updateRoom(5, request(4)).getBody().getCapacity());
    }
    @Test void rejectsZeroEvenWithoutMvcValidation() {
        existingRoom();
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> controller.updateRoom(5, request(0))).getStatusCode());
        verifyNoInteractions(classes);verify(rooms, never()).save(any());
    }
    @Test void holdsSameRoomLockBeforeCheckingClassesAndSaving() throws Exception {
        existingRoom();when(rooms.save(room)).thenReturn(room);
        controller.updateRoom(5, request(2));
        var order = inOrder(rooms, classes);
        order.verify(rooms).findByIdForUpdate(5);
        order.verify(classes).existsByRoomIdAndStatusAndScheduleTimeAfterAndMaxCapacityGreaterThan(
                eq(5), eq("SCHEDULED"), any(), eq(2));
        order.verify(rooms).save(room);
        assertNotNull(RoomController.class.getMethod("updateRoom", Integer.class, RoomRequest.class)
                .getAnnotation(Transactional.class));
    }
    @org.springframework.boot.test.context.TestConfiguration @EnableMethodSecurity
    static class SecurityTestConfig {
        @Bean RoomRepository rooms() { return mock(RoomRepository.class); }
        @Bean ClassRepository classes() { return mock(ClassRepository.class); }
        @Bean RoomController controller(RoomRepository rooms, ClassRepository classes) {
            return new RoomController(rooms, classes);
        }
    }
    @Test void receptionistCannotInvokeUpdateThroughMethodSecurity() {
        try (var context = new AnnotationConfigApplicationContext(SecurityTestConfig.class)) {
            SecurityContextHolder.getContext().setAuthentication(
                    new TestingAuthenticationToken("reception", "unused", "ROLE_RECEPTIONIST"));
            assertThrows(AccessDeniedException.class,
                    () -> context.getBean(RoomController.class).updateRoom(5, request(2)));
            verifyNoInteractions(context.getBean(RoomRepository.class), context.getBean(ClassRepository.class));
        } finally { SecurityContextHolder.clearContext(); }
    }
}
