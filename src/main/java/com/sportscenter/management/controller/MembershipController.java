package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.service.MembershipService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/memberships")
@RequiredArgsConstructor
public class MembershipController {

    private final MembershipService membershipService;

    @PostMapping("/subscribe")
    public ResponseEntity<MemberSubscriptionResponse> subscribe(@RequestBody MemberSubscriptionRequest request) {
        return ResponseEntity.status(201).body(membershipService.subscribeMembershipPackage(request));
    }

    @GetMapping("/members/{memberId}/active")
    public ResponseEntity<MemberSubscriptionResponse> getActiveMembership(@PathVariable Integer memberId) {
        return membershipService.getActiveMembership(memberId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/members/{memberId}")
    public List<MemberSubscriptionResponse> getHistory(@PathVariable Integer memberId) {
        return membershipService.getMemberSubscriptionHistory(memberId);
    }

    @GetMapping("/members/{memberId}/expiration")
    public ResponseEntity<String> getExpirationDate(@PathVariable Integer memberId) {
        String expirationDate = membershipService.getSubscriptionExpirationDate(memberId);
        return expirationDate == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(expirationDate);
    }

    @PostMapping("/{subscriptionId}/renew")
    public MemberSubscriptionResponse renew(
            @PathVariable Integer subscriptionId, @RequestParam Integer packageId) {
        return membershipService.renewSubscription(subscriptionId, packageId);
    }

    @PostMapping("/{subscriptionId}/cancel")
    public MemberSubscriptionResponse cancel(@PathVariable Integer subscriptionId) {
        return membershipService.cancelSubscription(subscriptionId);
    }
}
