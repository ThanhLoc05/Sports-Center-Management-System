package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.BookingResponse;
import com.sportscenter.management.dto.Response.ClassStudentResponse;
import com.sportscenter.management.service.BookingService;
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

    // 🔒 HỌC VIÊN HOẶC LỄ TÂN/MANAGER ĐƯỢC ĐẶT LỚP
    @PostMapping("/classes/{classId}/book")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<BookingResponse> bookClass(
            @PathVariable Integer classId, @RequestParam Integer memberId) {
        return ResponseEntity.status(201).body(bookingService.bookClass(classId, memberId));
    }

    @GetMapping("/bookings/{bookingId}")
    public ResponseEntity<BookingResponse> getBooking(@PathVariable Integer bookingId) {
        return bookingService.getBookingById(bookingId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // 🔒 HLV & MANAGER & LỄ TÂN ĐƯỢC XEM BẢN GHI BOOKING CỦA LỚP
    @GetMapping("/classes/{classId}/bookings")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<BookingResponse> getClassBookings(@PathVariable Integer classId) {
        return bookingService.getClassBookings(classId);
    }

    // 🔒 HLV & MANAGER XEM DANH SÁCH HỌC VIÊN KÈM MỤC TIÊU TẬP LUYỆN
    @GetMapping("/classes/{classId}/students")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<ClassStudentResponse> getClassStudents(@PathVariable Integer classId) {
        return bookingService.getClassStudents(classId);
    }

    @GetMapping("/members/{memberId}/bookings")
    public List<BookingResponse> getMemberBookings(@PathVariable Integer memberId) {
        return bookingService.getMemberBookings(memberId);
    }

    // 🔒 HỌC VIÊN HOẶC LỄ TÂN/MANAGER ĐƯỢC HỦY ĐẶT LỚP
    @DeleteMapping("/bookings/{bookingId}")
    @PreAuthorize("hasAnyRole('MEMBER', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public BookingResponse cancelBooking(@PathVariable Integer bookingId) {
        return bookingService.cancelBooking(bookingId);
    }
}
