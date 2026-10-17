package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.dto.Response.ClassStudentResponse;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.auth.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ ĐẶT LỚP HỌC (CLASS BOOKING MANAGEMENT)
 * ============================================================================
 * Nghiệp vụ và phân quyền:
 * - Học viên (MEMBER): Chỉ được đặt lịch hoặc hủy lịch cho chính tài khoản của mình.
 * - Lễ tân (RECEPTIONIST) & Quản lý (MANAGER): Có quyền đặt hộ hoặc hủy lịch hộ cho học viên tại quầy.
 * - Huấn luyện viên (COACH) & Lễ tân: Có quyền xem danh sách toàn bộ học viên và mục tiêu tập luyện trong lớp.
 */
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;
    private final SecurityUtils securityUtils;

    /**
     * ĐẶT CHỖ LỚP HỌC (BOOK A CLASS)
     * - Luồng xử lý:
     *   1. Lấy userId từ JWT đang đăng nhập.
     *   2. Nếu là MEMBER, bắt buộc memberId phải trùng với ID trong token (chống đặt hộ tùy tiện).
     *   3. Nếu là Lễ tân/Quản lý, cho phép truyền memberId của học viên khác để đặt tại quầy.
     *   4. Gọi BookingService kiểm tra: lớp còn chỗ không, học viên có gói tập hợp lệ không, đã book chưa.
     */
    @PostMapping("/classes/{classId}/book")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> bookClass(
            @PathVariable Integer classId, @RequestParam(required = false) Integer memberId) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        // Nếu client không truyền memberId thì mặc định lấy tài khoản đang đăng nhập
        if (memberId == null) memberId = currentUserId;

        // BẢO MẬT: Nếu là Học viên (MEMBER), CHỈ được đặt chỗ cho chính mình
        if (securityUtils.hasRole("MEMBER") && !currentUserId.equals(memberId)) {
            return ResponseEntity.status(403).build();
        }

        // BẢO MẬT: Chỉ Lễ tân và Quản lý mới được phép đặt chỗ hộ cho học viên khác
        if (!currentUserId.equals(memberId) &&
                !(securityUtils.isReceptionist() || securityUtils.isManagerOrCenterManager())) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.status(201).body(bookingService.bookClass(classId, memberId));
    }

    /**
     * XEM CHI TIẾT 1 BẢN GHI BOOKING THEO ID
     */
    @GetMapping("/bookings/{bookingId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable Integer bookingId) {
        return bookingService.getBookingById(bookingId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * XEM DANH SÁCH LƯỢT BOOKING CỦA MỘT LỚP
     * - Phân quyền: CHỈ COACH (HLV phụ trách), RECEPTIONIST (Lễ tân) và MANAGER mới được xem.
     * - Ngăn chặn học viên thường tò mò danh sách người khác đặt chỗ.
     */
    @GetMapping("/classes/{classId}/bookings")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<BookingResponse> getClassBookings(@PathVariable Integer classId) {
        return bookingService.getClassBookings(classId);
    }

    /**
     * TÍNH NĂNG DÀNH CHO HUẤN LUYỆN VIÊN (COACH) VÀ LỄ TÂN:
     * Xem danh sách học viên trong lớp kèm theo Mục tiêu tập luyện (Fitness Goals) và SĐT khẩn cấp.
     * - Huấn luyện viên xem để nắm bắt thể trạng/nhu cầu từng học viên trước giờ lên lớp.
     */
    @GetMapping("/classes/{classId}/students")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<ClassStudentResponse> getClassStudents(@PathVariable Integer classId) {
        return bookingService.getClassStudents(classId);
    }

    /**
     * XEM LỊCH SỬ ĐẶT LỚP CỦA MỘT HỌC VIÊN
     * - Bảo mật: Học viên chỉ xem được lịch sử của chính mình; Lễ tân/Quản lý xem được của mọi người.
     */
    @GetMapping("/members/{memberId}/bookings")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BookingResponse>> getMemberBookings(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(bookingService.getMemberBookings(memberId));
    }

    /**
     * HỦY ĐẶT LỚP HỌC (CANCEL BOOKING)
     * - Bảo mật: Chỉ chủ nhân của lượt book hoặc Lễ tân/Quản lý mới được quyền hủy.
     */
    @DeleteMapping("/bookings/{bookingId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> cancelBooking(@PathVariable Integer bookingId) {
        var booking = bookingService.getBookingById(bookingId);
        if (booking.isEmpty()) return ResponseEntity.notFound().build();

        Integer bookingMemberId = booking.get().getMemberId();
        // Kiểm tra xem người gọi có phải chính chủ lượt book hoặc là nhân viên được ủy quyền
        if (!securityUtils.isOwnerOrAuthorized(bookingMemberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(bookingService.cancelBooking(bookingId));
    }
}
