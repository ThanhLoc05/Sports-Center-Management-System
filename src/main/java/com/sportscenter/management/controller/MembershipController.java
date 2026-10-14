package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.service.MembershipService;
import com.sportscenter.management.service.UserService;
import com.sportscenter.auth.SecurityUtils;
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
    private final UserService userService;
    private final SecurityUtils securityUtils;

    @PostMapping("/subscribe")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@RequestBody MemberSubscriptionRequest request) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) {
            return ResponseEntity.status(401).build();
        }

        // If the caller is a MEMBER, force subscription for themselves only
        if (securityUtils.hasRole("MEMBER") && !currentUserId.equals(request.getMemberId())) {
            return ResponseEntity.status(403).build();
        }

        // If no memberId provided, assume current user
        if (request.getMemberId() == null) {
            request.setMemberId(currentUserId);
        }

        // Receptionist/Manager/Center Manager can create on behalf of others
        if (!currentUserId.equals(request.getMemberId()) &&
                !(securityUtils.isReceptionist() || securityUtils.isManagerOrCenterManager())) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.status(201).body(membershipService.subscribeMembershipPackage(request));
    }

    @GetMapping("/members/{memberId}/active")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberSubscriptionResponse> getActiveMembership(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return membershipService.getActiveMembership(memberId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/members/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<MemberSubscriptionResponse>> getHistory(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(membershipService.getMemberSubscriptionHistory(memberId));
    }

    @GetMapping("/members/{memberId}/expiration")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> getExpirationDate(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        String expirationDate = membershipService.getSubscriptionExpirationDate(memberId);
        return expirationDate == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(expirationDate);
    }

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
