package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.dto.Response.AttendanceResponse;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Service interface for managing class attendance
 */
public interface AttendanceService {

    /**
     * Record attendance for a member in a class
     * @param request Attendance request
     * @return Attendance record response
     */
    AttendanceResponse checkInMember(AttendanceRequest request);

    /**
     * Get attendance record by ID
     * @param attendanceId Attendance ID
     * @return Attendance details
     */
    Optional<AttendanceResponse> getAttendanceById(Integer attendanceId);

    /**
     * Get all attendance records for a class
     * @param classId Class ID
     * @return List of attendance records
     */
    List<AttendanceResponse> getClassAttendance(Integer classId);

    /**
     * Get attendance records for a member in a date range
     * @param memberId Member ID
     * @param startDate Start date
     * @param endDate End date
     * @return List of attendance records
     */
    List<AttendanceResponse> getMemberAttendanceHistory(Integer memberId, LocalDate startDate, LocalDate endDate);

    /**
     * Get attendance rate for a member
     * @param memberId Member ID
     * @return Attendance percentage
     */
    double getMemberAttendanceRate(Integer memberId);

    /**
     * Get attendance count for a member in date range
     * @param memberId Member ID
     * @param startDate Start date
     * @param endDate End date
     * @return Count of classes attended
     */
    int getAttendanceCount(Integer memberId, LocalDate startDate, LocalDate endDate);

    /**
     * Get absentee list for a class
     * @param classId Class ID
     * @return List of absentee records
     */
    List<AttendanceResponse> getAbsenteeList(Integer classId);
}
