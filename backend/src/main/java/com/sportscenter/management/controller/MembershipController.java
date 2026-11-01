package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Request.MembershipPackageRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipPackageResponse;
import com.sportscenter.management.service.MembershipService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ GÓI TẬP VÀ ĐĂNG KÝ (MEMBERSHIP & SUBSCRIPTION)
 * ============================================================================
 * Phân quyền và luồng nghiệp vụ:
 * 1. Xem danh sách gói tập (GET /packages): Công khai cho khách vãng lai và mọi học viên.
 * 2. Tạo gói tập mới (POST /packages): Chỉ dành riêng cho Quản lý trung tâm.
 * 3. Đăng ký/gia hạn gói mới dùng MembershipOrderController; API subscribe/renew cũ
 *    được giữ route để báo chuyển đổi, không còn tạo hoặc kích hoạt gói.
 * 4. Xem gói tập đang hoạt động / lịch sử / ngày hết hạn:
 *    - Chỉ chính chủ học viên hoặc Lễ tân/Quản lý mới được xem (chống xem trộm dữ liệu giữa các học viên).
 * 5. Hủy gói vẫn theo API hiện có; mua/gia hạn chỉ hoàn tất sau xác nhận thu tiền.
 */
@RestController
@RequestMapping("/api/v1/memberships")
@RequiredArgsConstructor
public class MembershipController {

    private final MembershipService membershipService;
    private final SecurityUtils securityUtils;

    /**
     * Lấy danh mục gói theo API quản lý gói cũ.
     * Endpoint này giữ tương thích cho các màn hình cũ; checkout mới dùng
     * GET /api/v1/membership-packages để nhận đúng cấu trúc dữ liệu theo hợp đồng mới.
     */
    @GetMapping("/packages")
    public List<MembershipPackageResponse> getPackages() {
        return membershipService.getAllPackages();
    }

    /**
     * Tạo gói hội viên mới từ thông tin quản lý cung cấp.
     * Chỉ CENTER_MANAGER được đặt tên, thời hạn, giá và cấp quyền cho gói.
     */
    @PostMapping("/packages")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<MembershipPackageResponse> createPackage(
            @Valid @RequestBody MembershipPackageRequest request) {
        return ResponseEntity.status(201).body(membershipService.createPackage(request));
    }

    /**
     * Route đăng ký cũ được giữ để client cũ nhận thông báo chuyển đổi.
     * Không tạo subscription hoặc hóa đơn tại đây; client phải dùng
     * POST /api/v1/membership-orders để tránh kích hoạt gói trước khi thu tiền.
     * Kết quả dự kiến là HTTP 409 Conflict kèm hướng dẫn endpoint mới.
     */
    @PostMapping("/subscribe")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@Valid @RequestBody MemberSubscriptionRequest request) {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "API đăng ký cũ đã được thay bằng POST /api/v1/membership-orders để tạo hóa đơn chờ trước khi thu tiền.");
    }

    /**
     * Lấy gói đang có hiệu lực theo ngày hiện tại của một thành viên.
     * Chỉ chủ tài khoản, lễ tân hoặc quản lý được xem; không có kết quả thì trả 404.
     */
    @GetMapping("/members/{memberId}/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> getActiveMembership(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return membershipService.getActiveMembership(memberId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Lấy lịch sử subscription của thành viên để hiển thị các kỳ đã mua/gia hạn.
     * Chỉ chủ tài khoản, lễ tân hoặc quản lý được xem; MEMBER khác bị từ chối 403.
     */
    @GetMapping("/members/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<MemberSubscriptionResponse>> getHistory(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(membershipService.getMemberSubscriptionHistory(memberId));
    }

    /**
     * Trả ngày kết thúc của gói đang có hiệu lực.
     * Trả 404 khi thành viên chưa có gói đang hiệu lực; giới hạn xem như API lịch sử.
     */
    @GetMapping("/members/{memberId}/expiration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> getExpirationDate(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        String expirationDate = membershipService.getSubscriptionExpirationDate(memberId);
        return expirationDate == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(expirationDate);
    }

    /**
     * Route gia hạn cũ được giữ để client cũ nhận lỗi hướng dẫn.
     * Không tạo kỳ mới ngay khi được gọi; dùng MembershipOrder để đợi xác nhận thu tiền.
     * Kết quả dự kiến là HTTP 409 Conflict.
     */
    @PostMapping("/{subscriptionId}/renew")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> renew(
            @PathVariable Integer subscriptionId, @RequestParam Integer packageId) {
        throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT,
                "API gia hạn cũ đã được thay bằng POST /api/v1/membership-orders; gói chỉ đổi sau khi xác nhận thu tiền.");
    }

    /**
     * Hủy subscription đang hoạt động hoặc chờ thanh toán theo chính sách cũ.
     * Kiểm tra chủ sở hữu/nhân viên trước khi chuyển trạng thái sang CANCELLED.
     * Việc hủy subscription không tự hoàn tiền hóa đơn đã thanh toán.
     */
    @PostMapping("/{subscriptionId}/cancel")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> cancel(@PathVariable Integer subscriptionId) {
        var subscription = membershipService.getSubscriptionById(subscriptionId);
        if (subscription == null) {
            return ResponseEntity.notFound().build();
        }
        if (!securityUtils.isOwnerOrAuthorized(subscription.getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(membershipService.cancelSubscription(subscriptionId));
    }
}
