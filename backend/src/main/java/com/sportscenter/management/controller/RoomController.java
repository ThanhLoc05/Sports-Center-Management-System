package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.RoomRequest;
import com.sportscenter.management.dto.Response.RoomResponse;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.RoomRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomRepository roomRepository;
    private final ClassRepository classRepository;

    @GetMapping
    public List<RoomResponse> getRooms() {
        return roomRepository.findAll().stream()
                .map(room -> RoomResponse.builder()
                        .id(room.getId())
                        .roomName(room.getRoomName())
                        .capacity(room.getCapacity())
                        .build())
                .toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<RoomResponse> createRoom(@Valid @RequestBody RoomRequest request) {
        if (request == null || request.getRoomName() == null || request.getRoomName().isBlank()) {
            throw new IllegalArgumentException("Tên phòng là bắt buộc");
        }
        if (request.getCapacity() == null || request.getCapacity() <= 0) {
            throw new IllegalArgumentException("Sức chứa phòng phải lớn hơn 0");
        }
        String roomName = request.getRoomName().trim();
        if (roomRepository.existsByRoomName(roomName)) {
            throw new IllegalArgumentException("Phòng đã tồn tại");
        }

        Room saved = roomRepository.save(Room.builder()
                .roomName(roomName)
                .capacity(request.getCapacity())
                .build());
        return ResponseEntity.status(201).body(RoomResponse.builder()
                .id(saved.getId())
                .roomName(saved.getRoomName())
                .capacity(saved.getCapacity())
                .build());
    }

    @PutMapping("/{roomId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @Transactional
    public ResponseEntity<RoomResponse> updateRoom(
            @PathVariable Integer roomId,
            @Valid @RequestBody RoomRequest request) {
        Room room = roomRepository.findByIdForUpdate(roomId)
                .orElseThrow(() -> new IllegalArgumentException("Phòng không tồn tại"));

        // Serialize with class creation/updates, which lock the same room row.
        // Validate before mutating the managed entity so a rejected edit changes nothing.
        if (request.getCapacity() == null || request.getCapacity() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sức chứa phòng phải lớn hơn 0");
        }
        if (classRepository.existsByRoomIdAndStatusAndScheduleTimeAfterAndMaxCapacityGreaterThan(
                roomId, "SCHEDULED", LocalDateTime.now(), request.getCapacity())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sức chứa phòng không thể nhỏ hơn sức chứa của lớp đã lên lịch trong tương lai");
        }

        if (request.getRoomName() != null && !request.getRoomName().isBlank()) {
            String newName = request.getRoomName().trim();
            if (!newName.equalsIgnoreCase(room.getRoomName()) && roomRepository.existsByRoomName(newName)) {
                throw new IllegalArgumentException("Tên phòng đã tồn tại");
            }
            room.setRoomName(newName);
        }
        if (request.getCapacity() != null && request.getCapacity() > 0) {
            room.setCapacity(request.getCapacity());
        }

        Room updated = roomRepository.save(room);
        return ResponseEntity.ok(RoomResponse.builder()
                .id(updated.getId())
                .roomName(updated.getRoomName())
                .capacity(updated.getCapacity())
                .build());
    }

    @DeleteMapping("/{roomId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @Transactional
    public ResponseEntity<Void> deleteRoom(@PathVariable Integer roomId) {
        Room room = roomRepository.findById(roomId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Phòng không tồn tại"));
        if (classRepository.existsByRoomId(roomId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Phòng đang được lớp học tham chiếu, chưa thể xóa");
        }
        roomRepository.delete(room);
        return ResponseEntity.noContent().build();
    }
}
