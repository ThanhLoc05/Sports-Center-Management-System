package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.dto.Response.AttendanceResponse;
import com.sportscenter.management.entity.Attendance;
import com.sportscenter.management.repository.AttendanceRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.AttendanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class AttendanceServiceImpl implements AttendanceService {

    private final AttendanceRepository attendanceRepository;
    private final ClassRepository classRepository;
    private final UserRepository userRepository;

    @Override
    public AttendanceResponse checkInMember(AttendanceRequest request) {
        if (request == null || request.getClassId() == null || request.getMemberId() == null
                || request.getCheckedInBy() == null) {
            throw new IllegalArgumentException("Lớp học, thành viên và người điểm danh là bắt buộc");
        }
        // Validate class exists
        if (!classRepository.existsById(request.getClassId())) {
            throw new IllegalArgumentException("Lớp học không tồn tại");
        }

        // Validate member exists
        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        // Validate checker-in exists
        if (!userRepository.existsById(request.getCheckedInBy())) {
            throw new IllegalArgumentException("Người điểm danh không tồn tại");
        }

        // Validate status
        if (!isValidAttendanceStatus(request.getStatus())) {
            throw new IllegalArgumentException("Trạng thái điểm danh không hợp lệ");
        }

        // Check if already checked in for this class
        Optional<Attendance> existing = attendanceRepository
                .findByClassIdAndMemberId(request.getClassId(), request.getMemberId());

        if (existing.isPresent()) {
            throw new IllegalArgumentException("Thành viên đã được điểm danh cho lớp này");
        }

        Attendance attendance = Attendance.builder()
                .classId(request.getClassId())
                .memberId(request.getMemberId())
                .checkedInBy(request.getCheckedInBy())
                .checkedInAt(LocalDateTime.now())
                .status(request.getStatus() != null ? request.getStatus() : "PRESENT")
                .build();

        Attendance savedAttendance = attendanceRepository.save(attendance);
        return mapToResponse(savedAttendance);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AttendanceResponse> getAttendanceById(Integer attendanceId) {
        return attendanceRepository.findById(attendanceId)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AttendanceResponse> getClassAttendance(Integer classId) {
        if (!classRepository.existsById(classId)) {
            throw new IllegalArgumentException("Lớp học không tồn tại");
        }

        return attendanceRepository.findByClassId(classId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<AttendanceResponse> getMemberAttendanceHistory(Integer memberId, LocalDate startDate, LocalDate endDate) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.plusDays(1).atStartOfDay().minusNanos(1);

        return attendanceRepository.findByMemberIdAndCheckedInAtBetween(memberId, startDateTime, endDateTime)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public double getMemberAttendanceRate(Integer memberId) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        List<Attendance> allAttendances = attendanceRepository.findByMemberId(memberId);

        if (allAttendances.isEmpty()) {
            return 0.0;
        }

        long presentCount = allAttendances.stream()
                .filter(a -> "PRESENT".equals(a.getStatus()))
                .count();

        return (double) presentCount / allAttendances.size() * 100;
    }

    @Override
    @Transactional(readOnly = true)
    public int getAttendanceCount(Integer memberId, LocalDate startDate, LocalDate endDate) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        LocalDateTime startDateTime = startDate.atStartOfDay();
        LocalDateTime endDateTime = endDate.plusDays(1).atStartOfDay().minusNanos(1);

        return (int) attendanceRepository.findByMemberIdAndCheckedInAtBetween(memberId, startDateTime, endDateTime)
                .stream()
                .filter(a -> "PRESENT".equals(a.getStatus()))
                .count();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AttendanceResponse> getAbsenteeList(Integer classId) {
        if (!classRepository.existsById(classId)) {
            throw new IllegalArgumentException("Lớp học không tồn tại");
        }

        return attendanceRepository.findByClassIdAndStatus(classId, "ABSENT").stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    private AttendanceResponse mapToResponse(Attendance attendance) {
        return AttendanceResponse.builder()
                .id(attendance.getId())
                .classId(attendance.getClassId())
                .memberId(attendance.getMemberId())
                .checkedInBy(attendance.getCheckedInBy())
                .checkedInAt(attendance.getCheckedInAt())
                .status(attendance.getStatus())
                .build();
    }

    private boolean isValidAttendanceStatus(String status) {
        return status == null || status.equals("PRESENT") || status.equals("ABSENT");
    }
}
