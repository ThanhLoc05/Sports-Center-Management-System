package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.SportRequest;
import com.sportscenter.management.dto.Response.SportResponse;
import com.sportscenter.management.entity.Sport;
import com.sportscenter.management.repository.SportRepository;
import jakarta.validation.Valid;
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
@RequestMapping("/api/v1/sports")
@RequiredArgsConstructor
public class SportController {

    private final SportRepository sportRepository;

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
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
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
}
