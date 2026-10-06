package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.service.BookingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class BookingController {

    private final BookingService bookingService;

    @PostMapping("/classes/{classId}/book")
    public ResponseEntity<BookingResponse> bookClass(
            @PathVariable Integer classId, @RequestParam Integer memberId) {
        return ResponseEntity.status(201).body(bookingService.bookClass(classId, memberId));
    }

    @GetMapping("/bookings/{bookingId}")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable Integer bookingId) {
        return bookingService.getBookingById(bookingId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/classes/{classId}/bookings")
    public List<BookingResponse> getClassBookings(@PathVariable Integer classId) {
        return bookingService.getClassBookings(classId);
    }

    @GetMapping("/members/{memberId}/bookings")
    public List<BookingResponse> getMemberBookings(@PathVariable Integer memberId) {
        return bookingService.getMemberBookings(memberId);
    }

    @DeleteMapping("/bookings/{bookingId}")
    public BookingResponse cancelBooking(@PathVariable Integer bookingId) {
        return bookingService.cancelBooking(bookingId);
    }
}
