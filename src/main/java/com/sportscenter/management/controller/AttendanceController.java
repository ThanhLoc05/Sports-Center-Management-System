package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.dto.Response.AttendanceResponse;
import com.sportscenter.management.service.AttendanceService;
import com.sportscenter.auth.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;
    private final SecurityUtils securityUtils;

    @PostMapping
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'COACH', 'CENTER_MANAGER', 'MANAGER')")
    public ResponseEntity<AttendanceResponse> checkIn(@RequestBody AttendanceRequest request) {
        return ResponseEntity.status(201).body(attendanceService.checkInMember(request));
    }

    @GetMapping("/{attendanceId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<AttendanceResponse> getAttendance(@PathVariable Integer attendanceId) {
        return attendanceService.getAttendanceById(attendanceId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/classes/{classId}")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<AttendanceResponse> getClassAttendance(@PathVariable Integer classId) {
        return attendanceService.getClassAttendance(classId);
    }

    @GetMapping("/classes/{classId}/absentees")
    @PreAuthorize("hasAnyRole('COACH', 'RECEPTIONIST', 'CENTER_MANAGER', 'MANAGER')")
    public List<AttendanceResponse> getAbsentees(@PathVariable Integer classId) {
        return attendanceService.getAbsenteeList(classId);
    }

    @GetMapping("/members/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<AttendanceResponse>> getMemberHistory(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getMemberAttendanceHistory(memberId, startDate, endDate));
    }

    @GetMapping("/members/{memberId}/rate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Double> getAttendanceRate(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getMemberAttendanceRate(memberId));
    }

    @GetMapping("/members/{memberId}/count")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Integer> getAttendanceCount(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(attendanceService.getAttendanceCount(memberId, startDate, endDate));
    }
}
