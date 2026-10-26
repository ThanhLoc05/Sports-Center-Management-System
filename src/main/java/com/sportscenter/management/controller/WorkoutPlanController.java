package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.dto.Response.WorkoutPlanResponse;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.ClassService;
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
    private final ClassService classService;
    private final BookingService bookingService;
    private final SecurityUtils securityUtils;

    @PostMapping
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<WorkoutPlanResponse> createPlan(@Valid @RequestBody WorkoutPlanRequest request) {
        if (securityUtils.isCoach()) {
            request.setCoachId(securityUtils.getCurrentUserId());
        }
        return ResponseEntity.status(201).body(workoutPlanService.createPlan(request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<WorkoutPlanResponse> updatePlan(
            @PathVariable Integer id, @RequestBody WorkoutPlanRequest request) {
        var existing = workoutPlanService.getPlanById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (!securityUtils.isCenterManager()
                && (currentUserId == null || !currentUserId.equals(existing.get().getCoachId()))) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(workoutPlanService.updatePlan(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<Void> deletePlan(@PathVariable Integer id) {
        var existing = workoutPlanService.getPlanById(id);
        if (existing.isEmpty()) return ResponseEntity.notFound().build();
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (!securityUtils.isCenterManager()
                && (currentUserId == null || !currentUserId.equals(existing.get().getCoachId()))) {
            return ResponseEntity.status(403).build();
        }
        workoutPlanService.deletePlan(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<WorkoutPlanResponse> getPlanById(@PathVariable Integer id) {
        var plan = workoutPlanService.getPlanById(id);
        if (plan.isEmpty()) return ResponseEntity.notFound().build();
        if (!canAccessPlan(plan.get())) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(plan.get());
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByMemberId(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(workoutPlanService.getPlansByMemberId(memberId));
    }

    @GetMapping("/coach/{coachId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByCoachId(@PathVariable Integer coachId) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (!securityUtils.isCenterManager()
                && (currentUserId == null || !currentUserId.equals(coachId))) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(workoutPlanService.getPlansByCoachId(coachId));
    }

    @GetMapping("/class/{classId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkoutPlanResponse>> getPlansByClassId(@PathVariable Integer classId) {
        if (!canAccessClass(classId)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(workoutPlanService.getPlansByClassId(classId));
    }

    private boolean canAccessPlan(WorkoutPlanResponse plan) {
        if (securityUtils.isCenterManager()) return true;
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return false;
        if (currentUserId.equals(plan.getCoachId())) return true;
        if (plan.getMemberId() != null && securityUtils.isOwnerOrAuthorized(plan.getMemberId())) return true;
        return plan.getClassId() != null && canAccessClass(plan.getClassId());
    }

    private boolean canAccessClass(Integer classId) {
        var clazz = classService.getClassById(classId);
        if (clazz.isEmpty()) return false;
        if (securityUtils.isCenterManager()) return true;

        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return false;
        if (securityUtils.isCoach()) return currentUserId.equals(clazz.get().getCoachId());
        if (!securityUtils.hasRole("MEMBER")) return false;

        return bookingService.getMemberBookings(currentUserId).stream()
                .anyMatch(booking -> booking.getClassId().equals(classId)
                        && "BOOKED".equals(booking.getStatus()));
    }
}
