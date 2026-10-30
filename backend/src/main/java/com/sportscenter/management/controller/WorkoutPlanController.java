package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.dto.Response.WorkoutPlanResponse;
import com.sportscenter.management.service.WorkoutPlanService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER KẾ HOẠCH HỌC TẬP & GIÁO ÁN (WORKOUT PLAN CONTROLLER)
 * ============================================================================
 * Phân quyền:
 * - Soạn giáo án, chỉnh sửa, xóa: Dành cho Huấn luyện viên (COACH) hoặc Quản lý trung tâm (CENTER_MANAGER).
 * - Học viên xem giáo án được phân công cho mình hoặc cho lớp mình học.
 */
@RestController
@RequestMapping("/api/v1/workout-plans")
@RequiredArgsConstructor
public class WorkoutPlanController {

    private final WorkoutPlanService workoutPlanService;

    @PostMapping
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<WorkoutPlanResponse> createPlan(@Valid @RequestBody WorkoutPlanRequest request) {
        return ResponseEntity.status(201).body(workoutPlanService.createPlan(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<WorkoutPlanResponse> updatePlan(
            @PathVariable Integer id, @RequestBody WorkoutPlanRequest request) {
        return ResponseEntity.ok(workoutPlanService.updatePlan(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<Void> deletePlan(@PathVariable Integer id) {
        workoutPlanService.deletePlan(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<WorkoutPlanResponse> getPlanById(@PathVariable Integer id) {
        return workoutPlanService.getPlanById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByMemberId(@PathVariable Integer memberId) {
        return ResponseEntity.ok(workoutPlanService.getPlansByMemberId(memberId));
    }

    @GetMapping("/coach/{coachId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByCoachId(@PathVariable Integer coachId) {
        return ResponseEntity.ok(workoutPlanService.getPlansByCoachId(coachId));
    }

    @GetMapping("/class/{classId}")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByClassId(@PathVariable Integer classId) {
        return ResponseEntity.ok(workoutPlanService.getPlansByClassId(classId));
    }
}
