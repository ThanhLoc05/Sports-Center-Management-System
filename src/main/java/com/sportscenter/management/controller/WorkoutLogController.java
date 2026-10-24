package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Response.WorkoutLogResponse;
import com.sportscenter.management.service.WorkoutLogService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER NHẬT KÝ KẾT QUẢ TẬP LUYỆN (WORKOUT LOG CONTROLLER)
 * ============================================================================
 * - Ghi nhận bài tập, số hiệp, số lần lặp, mức tạ thực hiện được.
 * - HLV nhận xét, đánh giá chuyên môn sau buổi tập.
 */
@RestController
@RequestMapping("/api/v1/workout-logs")
@RequiredArgsConstructor
public class WorkoutLogController {

    private final WorkoutLogService workoutLogService;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<WorkoutLogResponse> createLog(@Valid @RequestBody WorkoutLogRequest request) {
        return ResponseEntity.status(201).body(workoutLogService.createLog(request));
    }

    @PatchMapping("/{id}/feedback")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<WorkoutLogResponse> updateFeedback(
            @PathVariable Integer id, @RequestParam String feedback) {
        return ResponseEntity.ok(workoutLogService.updateFeedback(id, feedback));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<WorkoutLogResponse> getLogById(@PathVariable Integer id) {
        return workoutLogService.getLogById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutLogResponse>> getLogsByMemberId(@PathVariable Integer memberId) {
        return ResponseEntity.ok(workoutLogService.getLogsByMemberId(memberId));
    }

    @GetMapping("/coach/{coachId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutLogResponse>> getLogsByCoachId(@PathVariable Integer coachId) {
        return ResponseEntity.ok(workoutLogService.getLogsByCoachId(coachId));
    }
}
