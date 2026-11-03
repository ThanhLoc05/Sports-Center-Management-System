package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.dto.Response.AttendanceResponse;
import com.sportscenter.management.service.AttendanceService;
import com.sportscenter.management.service.ClassService;
import com.sportscenter.auth.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * ============================================================================
 * CONTROLLER ĐIỂM DANH HỌC VIÊN (ATTENDANCE MANAGEMENT)
 * ============================================================================
 * Nghiệp vụ và phân quyền:
 * 1. Điểm danh (checkIn):
 *    - Lễ tân (RECEPTIONIST) điểm danh khi học viên check-in tại cửa trung tâm.
 *    - Huấn luyện viên (COACH) điểm danh học viên trong từng buổi tập trên lớp.
 * 2. Theo dõi điểm danh lớp học & Danh sách vắng mặt (absentees):
 *    - HLV, Lễ tân và Quản lý theo dõi sỉ số buổi tập.
 * 3. Tra cứu lịch sử chuyên cần của học viên:
 *    - Học viên tự xem số buổi đi tập và tỷ lệ chuyên cần của mình.
 *    - Lễ tân/Quản lý xem được để hỗ trợ học viên.
 */
@RestController
@RequestMapping("/api/v1/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;
    private final ClassService classService;
    private final SecurityUtils securityUtils;

    /**
     * THỰC HIỆN ĐIỂM DANH HỌC VIÊN (CHECK-IN)
     * - Dành cho Lễ tân tại quầy hoặc Huấn luyện viên tại lớp học.
     * - Hệ thống tự động ghi nhận người thực hiện điểm danh (checkedInBy).
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'COACH', 'CENTER_MANAGER')")
    public ResponseEntity<AttendanceResponse> checkIn(@RequestBody AttendanceRequest request) {
        return ResponseEntity.status(201).body(attendanceService.checkInMember(request));
    }

    /**
     * XEM CHI TIẾT 1 BẢN GHI ĐIỂM DANH
     */
    @GetMapping("/{attendanceId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<AttendanceResponse> getAttendance(@PathVariable Integer attendanceId) {
        var attendance = attendanceService.getAttendanceById(attendanceId);
        if (attendance.isEmpty()) return ResponseEntity.notFound().build();
        boolean ownerOrStaff = securityUtils.isOwnerOrAuthorized(attendance.get().getMemberId());
        boolean assignedCoach = securityUtils.isCoach()
                && isAssignedCoach(attendance.get().getClassId());
        if (!ownerOrStaff && !assignedCoach) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendance.get());
    }

    /**
     * XEM TẤT CẢ LƯỢT ĐIỂM DANH CỦA MỘT LỚP HỌC
     * - Dành cho HLV phụ trách lớp, Lễ tân và Quản lý.
     */
    @GetMapping("/classes/{classId}")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public List<AttendanceResponse> getClassAttendance(@PathVariable Integer classId) {
        if (!canManageClassAttendance(classId)) throw new org.springframework.security.access.AccessDeniedException("Không có quyền xem điểm danh lớp này");
        return attendanceService.getClassAttendance(classId);
    }

    /**
     * DANH SÁCH HỌC VIÊN VẮNG MẶT TRONG LỚP (ABSENTEES)
     * - Huấn luyện viên xem danh sách học viên vắng mặt để nhắc nhở và quản lý chuyên cần.
     */
    @GetMapping("/classes/{classId}/absentees")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public List<AttendanceResponse> getAbsentees(@PathVariable Integer classId) {
        if (!canManageClassAttendance(classId)) throw new org.springframework.security.access.AccessDeniedException("Không có quyền xem điểm danh lớp này");
        return attendanceService.getAbsenteeList(classId);
    }

    /**
     * LỊCH SỬ ĐIỂM DANH CỦA MỘT HỌC VIÊN THEO KHOẢNG THỜI GIAN
     * - Bảo mật: Học viên xem lịch sử của chính mình; Lễ tân/Quản lý xem được toàn bộ.
     */
    @GetMapping("/members/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<AttendanceResponse>> getMemberHistory(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getMemberAttendanceHistory(memberId, startDate, endDate));
    }

    /**
     * TÍNH TỶ LỆ CHUYÊN CẦN (%) CỦA HỌC VIÊN
     */
    @GetMapping("/members/{memberId}/rate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Double> getAttendanceRate(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getMemberAttendanceRate(memberId));
    }

    /**
     * ĐẾM SỐ BUỔI ĐÃ THAM GIA TẬP CỦA HỌC VIÊN
     */
    @GetMapping("/members/{memberId}/count")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Integer> getAttendanceCount(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getAttendanceCount(memberId, startDate, endDate));
    }

    private boolean canManageClassAttendance(Integer classId) {
        if (securityUtils.isCenterManager() || securityUtils.isReceptionist()) return true;
        return securityUtils.isCoach() && isAssignedCoach(classId);
    }

    private boolean isAssignedCoach(Integer classId) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        return currentUserId != null && classService.getClassById(classId)
                .map(clazz -> currentUserId.equals(clazz.getCoachId()))
                .orElse(false);
    }
}
