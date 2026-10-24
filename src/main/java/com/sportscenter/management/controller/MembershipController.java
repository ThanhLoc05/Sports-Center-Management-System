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
 * 2. Tạo gói tập mới (POST /packages): Chỉ dành riêng cho Quản lý trung tâm (CENTER_MANAGER).
 * 3. Đăng ký gói tập (POST /subscribe):
 *    - Học viên: Chỉ được đăng ký cho chính mình.
 *    - Lễ tân / Quản lý: Có quyền làm thủ tục đăng ký gói tập cho học viên tại quầy.
 * 4. Xem gói tập đang hoạt động / lịch sử / ngày hết hạn:
 *    - Chỉ chính chủ học viên hoặc Lễ tân/Quản lý mới được xem (chống xem trộm dữ liệu giữa các học viên).
 * 5. Gia hạn (renew) và Hủy gói tập (cancel):
 *    - Học viên tự gia hạn hoặc Lễ tân/Quản lý thực hiện tại quầy.
 */
@RestController
@RequestMapping("/api/v1/memberships")
@RequiredArgsConstructor
public class MembershipController {

    private final MembershipService membershipService;
    private final SecurityUtils securityUtils;

    /**
     * XEM DANH SÁCH TẤT CẢ CÁC GÓI TẬP (PACKAGES)
     * - Công khai: Khách xem giá và số ngày để lựa chọn đăng ký.
     */
    @GetMapping("/packages")
    public List<MembershipPackageResponse> getPackages() {
        return membershipService.getAllPackages();
    }

    /**
     * TẠO GÓI TẬP MỚI (CREATE PACKAGE)
     * - Bảo mật: CHỈ Quản lý trung tâm (CENTER_MANAGER) mới có quyền tạo gói tập và định giá.
     */
    @PostMapping("/packages")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<MembershipPackageResponse> createPackage(
            @Valid @RequestBody MembershipPackageRequest request) {
        return ResponseEntity.status(201).body(membershipService.createPackage(request));
    }

    /**
     * ĐĂNG KÝ GÓI TẬP (SUBSCRIBE PACKAGE)
     * - Luồng xử lý:
     *   1. Xác định ID người đang gọi từ JWT.
     *   2. Nếu là MEMBER, kiểm tra: memberId gửi lên phải chính là currentUserId (chống đăng ký hộ trái phép).
     *   3. Nếu là Lễ tân (RECEPTIONIST) hoặc Quản lý: Được phép đăng ký cho bất kỳ memberId nào tại quầy.
     *   4. Service kiểm tra xem học viên có đang có gói tập ACTIVE nào không (mỗi lúc chỉ có 1 gói hoạt động).
     */
    @PostMapping("/subscribe")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@Valid @RequestBody MemberSubscriptionRequest request) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        // Nếu là MEMBER, CHỈ được phép đăng ký cho chính mình
        if (securityUtils.hasRole("MEMBER") && !currentUserId.equals(request.getMemberId())) {
            return ResponseEntity.status(403).build();
        }

        // Nếu client không gửi memberId, tự động gán ID của tài khoản đang đăng nhập
        if (request.getMemberId() == null) {
            request.setMemberId(currentUserId);
        }

        // Chỉ chính chủ HOẶC Lễ tân/Quản lý mới được thao tác
        if (!currentUserId.equals(request.getMemberId()) &&
                !(securityUtils.isReceptionist() || securityUtils.isCenterManager())) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.status(201).body(membershipService.subscribeMembershipPackage(request));
    }

    /**
     * XEM GÓI TẬP ĐANG HOẠT ĐỘNG (ACTIVE MEMBERSHIP)
     * - Bảo mật: Chỉ chính chủ học viên hoặc Lễ tân/Quản lý mới được xem.
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
     * XEM TOÀN BỘ LỊCH SỬ ĐĂNG KÝ GÓI TẬP CỦA HỌC VIÊN
     * - Bảo mật: Chặn không cho học viên khác xem trộm lịch sử đăng ký.
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
     * TRA CỨU NGÀY HẾT HẠN GÓI TẬP CỦA HỌC VIÊN
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
     * GIA HẠN GÓI TẬP (RENEW SUBSCRIPTION)
     * - Học viên tự gia hạn hoặc Lễ tân gia hạn hộ tại quầy.
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
     * HỦY GÓI TẬP (CANCEL SUBSCRIPTION)
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
