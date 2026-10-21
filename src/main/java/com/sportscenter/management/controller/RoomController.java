package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.RoomRequest;
import com.sportscenter.management.dto.Response.RoomResponse;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomRepository roomRepository;

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
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<RoomResponse> createRoom(@RequestBody RoomRequest request) {
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
}
