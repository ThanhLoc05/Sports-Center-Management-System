package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.FlexibleBookingPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FlexibleBookingController {
    private final FlexibleBookingPolicy policy;
    private final BookingService booking;
    private final SecurityUtils security;

    @org.springframework.beans.factory.annotation.Value("${app.booking.maximum-held:5}")
    private int maximumHeld;

    public record Supplies(boolean towel, boolean water) {}

    @PutMapping("/classes/{classId}/members/{memberId}/vip-supplies")
    @PreAuthorize("hasRole('RECEPTIONIST')")
    public FlexibleBookingPolicy.VipSupplies supplies(@PathVariable int classId, @PathVariable int memberId,
                                                     @RequestBody Supplies request) {
        return policy.recordVipSupplies(classId, memberId, security.getCurrentUserId(), request.towel(), request.water());
    }

    @GetMapping("/bookings/my-conduct")
    @PreAuthorize("hasRole('MEMBER')")
    public FlexibleBookingPolicy.BookingStatus conduct() {
        return policy.status(security.getCurrentUserId(), maximumHeld);
    }

    public record HoldingStatus(int held, int limit) {}

    @GetMapping("/members/{memberId}/booking-conduct")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public HoldingStatus memberConduct(@PathVariable int memberId) {
        var status = policy.status(memberId, maximumHeld);
        return new HoldingStatus(status.held(), status.limit());
    }

    @GetMapping("/bookings/my-waitlist")
    @PreAuthorize("hasRole('MEMBER')")
    public List<FlexibleBookingPolicy.WaitlistEntry> waitlist() {
        return policy.entries(security.getCurrentUserId());
    }

    @PostMapping("/classes/{classId}/waitlist")
    @PreAuthorize("hasRole('MEMBER')")
    public FlexibleBookingPolicy.WaitlistEntry join(@PathVariable int classId) {
        return policy.join(classId, security.getCurrentUserId());
    }

    @PostMapping("/classes/{classId}/waitlist/accept")
    @PreAuthorize("hasRole('MEMBER')")
    @ResponseStatus(HttpStatus.CREATED)
    public BookingResponse accept(@PathVariable int classId) {
        return booking.acceptWaitlist(classId, security.getCurrentUserId());
    }

    @PostMapping("/classes/{classId}/waitlist/decline")
    @PreAuthorize("hasRole('MEMBER')")
    public FlexibleBookingPolicy.WaitlistEntry decline(@PathVariable int classId) {
        return policy.decline(classId, security.getCurrentUserId());
    }

    @PostMapping("/classes/{classId}/members/{memberId}/no-show")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmNoShow(@PathVariable int classId, @PathVariable int memberId) {
        policy.confirmNoShow(classId, memberId, security.isCoach() ? security.getCurrentUserId() : null);
    }

    @PostMapping("/classes/{classId}/members/{memberId}/excuse-booking-violation")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void excuse(@PathVariable int classId, @PathVariable int memberId) {
        policy.excuse(classId, memberId, security.getCurrentUserId());
    }
}
