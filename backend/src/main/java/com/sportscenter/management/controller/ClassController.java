package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Request.ClassCancellationRequest;
import com.sportscenter.management.dto.Response.ClassResponse;
import com.sportscenter.management.service.ClassService;
import com.sportscenter.management.service.FlexibleClassSlot;
import com.sportscenter.management.service.NotificationDeliveryService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ LỚP HỌC (CLASS MANAGEMENT)
 * ============================================================================
 * Nghiệp vụ và phân quyền:
 * 1. Khách vãng lai và học viên: Được xem danh sách lớp học, lịch học, số chỗ còn trống.
 * 2. Huấn luyện viên (COACH): Có API riêng để xem các lớp do chính mình phụ trách (GET /my-classes).
 * 3. Quản lý trung tâm: Tạo lớp mới, phân công HLV, sửa thông tin lớp, hủy lớp học.
 */
@RestController
@RequestMapping("/api/v1/classes")
@RequiredArgsConstructor
public class ClassController {

    private final ClassService classService;
    private final SecurityUtils securityUtils;
    private final NotificationDeliveryService notifications;

    /**
     * TẠO LỚP HỌC MỚI VÀ PHÂN CÔNG HUẤN LUYỆN VIÊN (CREATE CLASS)
     * - Bảo mật: CHỈ Quản lý trung tâm.
     */
    @PostMapping
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<ClassResponse> createClass(@Valid @RequestBody ClassRequest request) {
        return ResponseEntity.status(201).body(classService.createClass(request));
    }

    /**
     * XEM TẤT CẢ CÁC LỚP HỌC (CÓ THỂ LỌC THEO BỘ MÔN SPORT_ID HOẶC HLV COACH_ID)
     * - Công khai: Khách và học viên tra cứu để chọn lớp.
     */
    @GetMapping
    public List<ClassResponse> getClasses(
            @RequestParam(required = false) Integer sportId,
            @RequestParam(required = false) Integer coachId) {
        return classService.getAllClasses(sportId, coachId);
    }

    /**
     * TÍNH NĂNG DÀNH CHO HUẤN LUYỆN VIÊN (COACH):
     * Xem danh sách các lớp học và lịch dạy do chính Coach đang đăng nhập phụ trách.
     * - Hệ thống tự động lấy ID từ Token, Coach không cần truyền ID thủ công.
     */
    @GetMapping("/my-classes")
    @PreAuthorize("hasAnyRole('COACH', 'CENTER_MANAGER')")
    public ResponseEntity<List<ClassResponse>> getMyClasses() {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(classService.getAllClasses(null, currentUserId));
    }

    /**
     * XEM DANH SÁCH CÁC LỚP CÒN CHỖ TRỐNG (AVAILABLE CLASSES)
     */
    @GetMapping("/management")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ClassService.ManagedSessions getManagedSessions(
            @RequestParam(defaultValue = "SCHEDULED") String status,
            @RequestParam(required = false) Integer sportId,
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(required = false) Integer coachId,
            @RequestParam(required = false) Integer roomId,
            @RequestParam(required = false) java.time.LocalDate fromDate,
            @RequestParam(required = false) java.time.LocalDate throughDate,
            @RequestParam(required = false) FlexibleClassSlot slot) {
        return classService.getManagedSessions(status, sportId, keyword, page, coachId, roomId, fromDate, throughDate, slot);
    }

    @GetMapping("/available")
    public List<ClassResponse> getAvailableClasses() {
        return classService.getAvailableClasses();
    }

    /**
     * XEM CHI TIẾT 1 LỚP HỌC THEO ID
     */
    @GetMapping("/{classId}")
    public ResponseEntity<ClassResponse> getClass(@PathVariable Integer classId) {
        return classService.getClassById(classId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * CẬP NHẬT THÔNG TIN LỚP HỌC / ĐỔI HLV PHỤ TRÁCH (UPDATE CLASS)
     * - Bảo mật: CHỈ Quản lý trung tâm.
     */
    @PutMapping("/{classId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @Transactional
    public ClassResponse updateClass(@PathVariable Integer classId, @Valid @RequestBody ClassRequest request) {
        var result = classService.updateClass(classId, request);
        notifications.publishManagerScheduleChangedAfterCommit();
        return result;
    }

    /**
     * HỦY LỚP HỌC (CANCEL CLASS)
     * - Bảo mật: CHỈ Quản lý trung tâm.
     */
    @PostMapping("/{classId}/cancel")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ClassResponse cancelClass(@PathVariable Integer classId,
                                     @Valid @RequestBody ClassCancellationRequest request) {
        return classService.cancelClass(classId, request, securityUtils.getCurrentUserId());
    }

    @GetMapping("/{classId}/cancellation")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MEMBER')")
    public ClassService.CancellationDetails getCancellation(@PathVariable Integer classId) {
        return classService.cancellationDetails(classId, securityUtils.getCurrentUserId(), securityUtils.isCenterManager());
    }

    /**
     * XEM SỐ LƯỢNG CHỖ TRỐNG HIỆN TẠI CỦA LỚP
     */
    @GetMapping("/{classId}/capacity")
    public int getAvailableCapacity(@PathVariable Integer classId) {
        return classService.getAvailableCapacity(classId);
    }
}
