package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Request.MembershipPackageRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipPackageResponse;
import com.sportscenter.management.service.MembershipService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/memberships")
@RequiredArgsConstructor
public class MembershipController {

    private final MembershipService membershipService;

    // 🔒 HỌC VIÊN HOẶC LỄ TÂN/MANAGER ĐĂNG KÝ GÓI TẬP
    @PostMapping("/subscribe")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@RequestBody MemberSubscriptionRequest request) {
        return ResponseEntity.status(201).body(membershipService.subscribeMembershipPackage(request));
    }

    @GetMapping("/members/{memberId}/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> getActiveMembership(@PathVariable Integer memberId) {
        return membershipService.getActiveMembership(memberId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/members/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public List<MemberSubscriptionResponse> getHistory(@PathVariable Integer memberId) {
        return membershipService.getMemberSubscriptionHistory(memberId);
    }

    @GetMapping("/members/{memberId}/expiration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> getExpirationDate(@PathVariable Integer memberId) {
        String expirationDate = membershipService.getSubscriptionExpirationDate(memberId);
        return expirationDate == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(expirationDate);
    }

    // 🔒 LỄ TÂN HOẶC MANAGER GIA HẠN GÓI TẬP TẠI QUẦY
    @PostMapping("/{subscriptionId}/renew")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public MemberSubscriptionResponse renew(
            @PathVariable Integer subscriptionId, @RequestParam Integer packageId) {
        return membershipService.renewSubscription(subscriptionId, packageId);
    }

    // 🔒 LỄ TÂN HOẶC MANAGER HỦY GÓI TẬP
    @PostMapping("/{subscriptionId}/cancel")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public MemberSubscriptionResponse cancel(@PathVariable Integer subscriptionId) {
        return membershipService.cancelSubscription(subscriptionId);
    }

    // 🔓 Ai đã đăng nhập cũng xem được danh sách các gói tập
    @GetMapping("/packages")
    @PreAuthorize("isAuthenticated()")
    public List<MembershipPackageResponse> getPackages() {
        return membershipService.getAllPackages();
    }

    // 🔒 Chỉ Manager mới được tạo gói tập mới
    @PostMapping("/packages")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<MembershipPackageResponse> createPackage(
            @RequestBody MembershipPackageRequest request) {
        return ResponseEntity.status(201).body(membershipService.createPackage(request));
    }
}
