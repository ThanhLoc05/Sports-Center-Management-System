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
 * 3. Cập nhật gói tập (PUT /packages/{packageId}): Chỉ dành riêng cho Quản lý trung tâm.
 * 4. Đăng ký gói tập (POST /subscribe): Tạo subscription PENDING_PAYMENT và hóa đơn PENDING theo giá gói.
 * 5. Gia hạn gói tập (POST /{subscriptionId}/renew): Tạo subscription PENDING_PAYMENT nối tiếp và hóa đơn PENDING.
 * 6. Xem gói tập đang hoạt động / lịch sử / ngày hết hạn: Chính chủ học viên hoặc Lễ tân/Quản lý.
 * 7. Hủy gói (POST /{subscriptionId}/cancel): Chuyển trạng thái sang CANCELLED.
 */
@RestController
@RequestMapping("/api/v1/memberships")
@RequiredArgsConstructor
public class MembershipController {

    private final MembershipService membershipService;
    private final SecurityUtils securityUtils;

    /**
     * Lấy danh mục tất cả các gói tập.
     */
    @GetMapping("/packages")
    public List<MembershipPackageResponse> getPackages() {
        return membershipService.getAllPackages();
    }

    /**
     * Tạo gói hội viên mới (chỉ Quản lý trung tâm).
     */
    @PostMapping("/packages")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<MembershipPackageResponse> createPackage(
            @Valid @RequestBody MembershipPackageRequest request) {
        return ResponseEntity.status(201).body(membershipService.createPackage(request));
    }

    /**
     * Cập nhật thông tin gói hội viên (chỉ Quản lý trung tâm).
     */
    @PutMapping("/packages/{packageId}")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<MembershipPackageResponse> updatePackage(
            @PathVariable Integer packageId,
            @Valid @RequestBody MembershipPackageRequest request) {
        return ResponseEntity.ok(membershipService.updatePackage(packageId, request));
    }

    /**
     * Đăng ký gói hội viên mới:
     * - Tạo subscription trạng thái PENDING_PAYMENT.
     * - Tự động phát sinh hóa đơn PENDING với số tiền lấy từ giá niêm yết của gói.
     * - Gói chỉ chuyển ACTIVE sau khi hóa đơn được xác nhận thanh toán.
     */
    @PostMapping("/subscribe")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@Valid @RequestBody MemberSubscriptionRequest request) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        // Học viên chỉ được đăng ký cho chính mình; Lễ tân và Quản lý được hỗ trợ tại quầy
        if (securityUtils.hasRole("MEMBER") && !currentUserId.equals(request.getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        if (!securityUtils.isOwnerOrAuthorized(request.getMemberId())) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.status(201).body(membershipService.subscribeMembershipPackage(request));
    }

    /**
     * Lấy gói đang có hiệu lực theo ngày hiện tại của một thành viên.
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
     * Gia hạn gói tập:
     * - Tạo subscription PENDING_PAYMENT nối tiếp kỳ cũ (hoặc từ hôm nay nếu đã hết hạn).
     * - Tự động phát sinh hóa đơn PENDING.
     */
    @PostMapping("/{subscriptionId}/renew")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> renew(
            @PathVariable Integer subscriptionId, @RequestParam Integer packageId) {
        var subscription = membershipService.getSubscriptionById(subscriptionId);
        if (subscription == null) {
            return ResponseEntity.notFound().build();
        }
        if (!securityUtils.isOwnerOrAuthorized(subscription.getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(membershipService.renewSubscription(subscriptionId, packageId));
    }

    /**
     * Hủy subscription đang hoạt động hoặc chờ thanh toán.
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
