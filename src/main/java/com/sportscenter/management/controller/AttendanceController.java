package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.dto.Response.AttendanceResponse;
import com.sportscenter.management.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    @PostMapping
    public ResponseEntity<AttendanceResponse> checkIn(@RequestBody AttendanceRequest request) {
        return ResponseEntity.status(201).body(attendanceService.checkInMember(request));
    }

    @GetMapping("/{attendanceId}")
    public ResponseEntity<AttendanceResponse> getAttendance(@PathVariable Integer attendanceId) {
        return attendanceService.getAttendanceById(attendanceId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/classes/{classId}")
    public List<AttendanceResponse> getClassAttendance(@PathVariable Integer classId) {
        return attendanceService.getClassAttendance(classId);
    }

    @GetMapping("/classes/{classId}/absentees")
    public List<AttendanceResponse> getAbsentees(@PathVariable Integer classId) {
        return attendanceService.getAbsenteeList(classId);
    }

    @GetMapping("/members/{memberId}")
    public List<AttendanceResponse> getMemberHistory(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return attendanceService.getMemberAttendanceHistory(memberId, startDate, endDate);
    }

    @GetMapping("/members/{memberId}/rate")
    public double getAttendanceRate(@PathVariable Integer memberId) {
        return attendanceService.getMemberAttendanceRate(memberId);
    }

    @GetMapping("/members/{memberId}/count")
    public int getAttendanceCount(
            @PathVariable Integer memberId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return attendanceService.getAttendanceCount(memberId, startDate, endDate);
    }
}
