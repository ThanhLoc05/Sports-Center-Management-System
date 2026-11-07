package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.SportRequest;
import com.sportscenter.management.dto.Response.SportResponse;
import com.sportscenter.management.entity.Sport;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.SportRepository;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sports")
@RequiredArgsConstructor
public class SportController {

    private final SportRepository sportRepository;
    private final ClassRepository classRepository;

    @GetMapping
    public List<SportResponse> getSports() {
        return sportRepository.findAll().stream()
                .map(sport -> SportResponse.builder()
                        .id(sport.getId())
                        .sportName(sport.getSportName())
                        .description(sport.getDescription())
                        .build())
                .toList();
    }

    @PostMapping
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<SportResponse> createSport(@Valid @RequestBody SportRequest request) {
        if (request == null || request.getSportName() == null || request.getSportName().isBlank()) {
            throw new IllegalArgumentException("Tên bộ môn là bắt buộc");
        }
        String sportName = request.getSportName().trim();
        if (sportRepository.existsBySportName(sportName)) {
            throw new IllegalArgumentException("Bộ môn đã tồn tại");
        }

        Sport saved = sportRepository.save(Sport.builder()
                .sportName(sportName)
                .description(request.getDescription())
                .build());
        return ResponseEntity.status(201).body(SportResponse.builder()
                .id(saved.getId())
                .sportName(saved.getSportName())
                .description(saved.getDescription())
                .build());
    }

    @PutMapping("/{sportId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<SportResponse> updateSport(
            @PathVariable Integer sportId,
            @Valid @RequestBody SportRequest request) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new IllegalArgumentException("Bộ môn không tồn tại"));

        if (request.getSportName() != null && !request.getSportName().isBlank()) {
            String newName = request.getSportName().trim();
            if (!newName.equalsIgnoreCase(sport.getSportName()) && sportRepository.existsBySportName(newName)) {
                throw new IllegalArgumentException("Tên bộ môn đã tồn tại");
            }
            sport.setSportName(newName);
        }
        if (request.getDescription() != null) {
            sport.setDescription(request.getDescription());
        }

        Sport updated = sportRepository.save(sport);
        return ResponseEntity.ok(SportResponse.builder()
                .id(updated.getId())
                .sportName(updated.getSportName())
                .description(updated.getDescription())
                .build());
    }

    @DeleteMapping("/{sportId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @Transactional
    public ResponseEntity<Void> deleteSport(@PathVariable Integer sportId) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bộ môn không tồn tại"));
        if (classRepository.existsBySportId(sportId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bộ môn đang được lớp học tham chiếu, chưa thể xóa");
        }
        sportRepository.delete(sport);
        return ResponseEntity.noContent().build();
    }
}
