package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.UserService;
import com.sportscenter.auth.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;
    private final SecurityUtils securityUtils;

    @PostMapping("/classes/{classId}/book")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> bookClass(
            @PathVariable Integer classId, @RequestParam(required = false) Integer memberId) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        // If no memberId provided, assume current user
        if (memberId == null) memberId = currentUserId;

        // If caller is MEMBER, they can only book for themselves
        if (securityUtils.hasRole("MEMBER") && !currentUserId.equals(memberId)) {
            return ResponseEntity.status(403).build();
        }

        // Receptionist and Managers can book on behalf of members
        if (!currentUserId.equals(memberId) &&
                !(securityUtils.isReceptionist() || securityUtils.isManagerOrCenterManager())) {
            return ResponseEntity.status(403).build();
        }

        return ResponseEntity.status(201).body(bookingService.bookClass(classId, memberId));
    }

    @GetMapping("/bookings/{bookingId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable Integer bookingId) {
        return bookingService.getBookingById(bookingId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/classes/{classId}/bookings")
    @PreAuthorize("isAuthenticated()")
    public List<BookingResponse> getClassBookings(@PathVariable Integer classId) {
        return bookingService.getClassBookings(classId);
    }

    @GetMapping("/members/{memberId}/bookings")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<BookingResponse>> getMemberBookings(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(bookingService.getMemberBookings(memberId));
    }

    @DeleteMapping("/bookings/{bookingId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<BookingResponse> cancelBooking(@PathVariable Integer bookingId) {
        // Fetch booking to verify owner
        var booking = bookingService.getBookingById(bookingId);
        if (booking.isEmpty()) return ResponseEntity.notFound().build();
        Integer currentUserId = securityUtils.getCurrentUserId();
        Integer bookingMemberId = booking.get().getMemberId();
        if (!securityUtils.isOwnerOrAuthorized(bookingMemberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(bookingService.cancelBooking(bookingId));
    }
}
