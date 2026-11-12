package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.AttendanceRequest;
import com.sportscenter.management.entity.Attendance;
import com.sportscenter.management.entity.ClassBooking;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.AttendanceRepository;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class AttendanceServiceWindowTest {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final LocalDateTime CLASS_START = LocalDateTime.of(2026, 11, 12, 10, 0);

    @Test
    void allowsCheckInAtWindowOpeningBoundary() {
        var fixture = fixture(CLASS_START.minusMinutes(15), "SCHEDULED", null, true);

        var result = fixture.service.checkInMember(request("PRESENT"));

        assertEquals("PRESENT", result.getStatus());
        assertEquals(CLASS_START.minusMinutes(15), result.getCheckedInAt());
        verify(fixture.attendance).save(any(Attendance.class));
    }

    @Test
    void rejectsCheckInBeforeWindowOpens() {
        var fixture = fixture(CLASS_START.minusMinutes(16), "SCHEDULED", null, true);

        assertThrows(IllegalArgumentException.class,
                () -> fixture.service.checkInMember(request("PRESENT")));
        verify(fixture.attendance, never()).save(any(Attendance.class));
    }

    @Test
    void allowsAssignedCoachToMakeUpAbsenceDuringGracePeriodOnCompletedClass() {
        var fixture = fixture(CLASS_START.plusMinutes(120), "COMPLETED", "ABSENT", true);

        var result = fixture.service.makeUpAttendance(30);

        assertEquals("PRESENT", result.getStatus());
        assertEquals(CLASS_START.plusMinutes(120), result.getCheckedInAt());
        verify(fixture.attendance).save(fixture.existing);
    }

    @Test
    void doesNotAllowNonCoachToMakeUpAnAbsence() {
        var fixture = fixture(CLASS_START.plusMinutes(30), "COMPLETED", "ABSENT", false);

        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> fixture.service.makeUpAttendance(30));
        assertEquals("ABSENT", fixture.existing.getStatus());
        verify(fixture.attendance, never()).save(any(Attendance.class));
    }

    @Test
    void rejectsCheckInAfterGracePeriod() {
        var fixture = fixture(CLASS_START.plusMinutes(121), "COMPLETED", null, true);

        assertThrows(IllegalArgumentException.class,
                () -> fixture.service.checkInMember(request("PRESENT")));
        verify(fixture.attendance, never()).save(any(Attendance.class));
    }

    @Test
    void rejectsMakeUpAfterGracePeriod() {
        var fixture = fixture(CLASS_START.plusMinutes(121), "COMPLETED", "ABSENT", true);

        assertThrows(IllegalArgumentException.class,
                () -> fixture.service.makeUpAttendance(30));
        assertEquals("ABSENT", fixture.existing.getStatus());
        verify(fixture.attendance, never()).save(any(Attendance.class));
    }

    private static Fixture fixture(
            LocalDateTime now, String classStatus, String existingStatus, boolean coach) {
        AttendanceRepository attendance = mock(AttendanceRepository.class);
        ClassRepository classes = mock(ClassRepository.class);
        ClassBookingRepository bookings = mock(ClassBookingRepository.class);
        UserRepository users = mock(UserRepository.class);
        SecurityUtils security = mock(SecurityUtils.class);
        Classes clazz = Classes.builder()
                .id(20)
                .coachId(5)
                .scheduleTime(CLASS_START)
                .durationMinutes(60)
                .status(classStatus)
                .build();
        Attendance existing = existingStatus == null ? null : Attendance.builder()
                .id(30)
                .classId(20)
                .memberId(4)
                .checkedInBy(5)
                .checkedInAt(CLASS_START.plusMinutes(30))
                .status(existingStatus)
                .build();
        when(classes.findById(20)).thenReturn(Optional.of(clazz));
        when(users.findById(4)).thenReturn(Optional.of(user(4, "MEMBER")));
        when(bookings.findByClassIdAndMemberId(20, 4))
                .thenReturn(Optional.of(ClassBooking.builder().status("BOOKED").build()));
        when(security.getCurrentUserId()).thenReturn(5);
        when(users.existsById(5)).thenReturn(true);
        when(security.isCoach()).thenReturn(coach);
        when(attendance.findByClassIdAndMemberId(20, 4)).thenReturn(Optional.ofNullable(existing));
        if (existing != null)
            when(attendance.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));
        when(attendance.save(any(Attendance.class))).thenAnswer(call -> call.getArgument(0));
        var clock = Clock.fixed(now.atZone(ZONE).toInstant(), ZONE);
        var service = new AttendanceServiceImpl(attendance, classes, bookings, users, security, clock);
        return new Fixture(service, attendance, existing);
    }

    private static AttendanceRequest request(String status) {
        return AttendanceRequest.builder().classId(20).memberId(4).status(status).build();
    }

    private static User user(int id, String roleName) {
        return User.builder().id(id).role(Role.builder().roleName(roleName).build()).build();
    }

    private record Fixture(AttendanceServiceImpl service, AttendanceRepository attendance, Attendance existing) { }
}
