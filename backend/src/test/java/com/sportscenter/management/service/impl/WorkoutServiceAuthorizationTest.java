package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.AttendanceRepository;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.WorkoutLogRepository;
import com.sportscenter.management.repository.WorkoutPlanRepository;
import com.sportscenter.management.service.impl.AttendanceServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class WorkoutServiceAuthorizationTest {
    private final SecurityUtils security = mock(SecurityUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ClassRepository classes = mock(ClassRepository.class);

    @Test
    void coachCannotCreateClassPlanForAnotherCoachsClass() {
        when(security.isCoach()).thenReturn(true);
        when(security.getCurrentUserId()).thenReturn(5);
        when(users.findById(5)).thenReturn(Optional.of(user(5, "COACH")));
        when(classes.findById(20)).thenReturn(Optional.of(
                Classes.builder().id(20).coachId(9).build()));
        WorkoutPlanRepository plans = mock(WorkoutPlanRepository.class);
        ClassBookingRepository bookings = mock(ClassBookingRepository.class);
        WorkoutPlanServiceImpl service = new WorkoutPlanServiceImpl(
                plans, users, classes, bookings, security);
        WorkoutPlanRequest request = WorkoutPlanRequest.builder()
                .title("Strength").description("Weekly strength plan").classId(20).build();

        assertThrows(AccessDeniedException.class, () -> service.createPlan(request));
        verify(plans, never()).save(any());
    }

    @Test
    void coachCannotCreatePersonalPlanForUnassignedMember() {
        when(security.isCoach()).thenReturn(true);
        when(security.getCurrentUserId()).thenReturn(5);
        when(users.findById(5)).thenReturn(Optional.of(user(5, "COACH")));
        when(users.findById(4)).thenReturn(Optional.of(user(4, "MEMBER")));
        when(classes.findByCoachId(5)).thenReturn(java.util.List.of());
        WorkoutPlanRepository plans = mock(WorkoutPlanRepository.class);
        ClassBookingRepository bookings = mock(ClassBookingRepository.class);
        WorkoutPlanServiceImpl service = new WorkoutPlanServiceImpl(
                plans, users, classes, bookings, security);
        WorkoutPlanRequest request = WorkoutPlanRequest.builder()
                .title("Strength").description("Weekly strength plan").memberId(4).build();

        assertThrows(AccessDeniedException.class, () -> service.createPlan(request));
        verify(plans, never()).save(any());
    }

    @Test
    void coachCannotRecordLogForAnotherCoachsClass() {
        when(security.isCoach()).thenReturn(true);
        when(security.getCurrentUserId()).thenReturn(5);
        when(users.findById(4)).thenReturn(Optional.of(user(4, "MEMBER")));
        when(users.findById(5)).thenReturn(Optional.of(user(5, "COACH")));
        when(classes.findById(20)).thenReturn(Optional.of(
                Classes.builder().id(20).coachId(9).build()));
        WorkoutLogRepository logs = mock(WorkoutLogRepository.class);
        ClassBookingRepository bookings = mock(ClassBookingRepository.class);
        WorkoutLogServiceImpl service = new WorkoutLogServiceImpl(
                logs, users, classes, bookings, security);
        WorkoutLogRequest request = WorkoutLogRequest.builder()
                .memberId(4).scheduleId(20).build();

        assertThrows(AccessDeniedException.class, () -> service.createLog(request));
        verify(logs, never()).save(any());
        verifyNoInteractions(bookings);
    }

    @Test
    void attendanceCannotBeRecordedForCancelledClass() {
        SecurityUtils attendanceSecurity = mock(SecurityUtils.class);
        ClassRepository attendanceClasses = mock(ClassRepository.class);
        UserRepository attendanceUsers = mock(UserRepository.class);
        AttendanceRepository attendance = mock(AttendanceRepository.class);
        ClassBookingRepository attendanceBookings = mock(ClassBookingRepository.class);
        when(attendanceClasses.findById(20)).thenReturn(Optional.of(
                Classes.builder().id(20).coachId(5).status("CANCELLED").build()));
        when(attendanceUsers.findById(4)).thenReturn(Optional.of(user(4, "MEMBER")));
        AttendanceServiceImpl service = new AttendanceServiceImpl(
                attendance, attendanceClasses, attendanceBookings, attendanceUsers, attendanceSecurity);
        var request = com.sportscenter.management.dto.Request.AttendanceRequest.builder()
                .classId(20).memberId(4).status("PRESENT").build();

        assertThrows(IllegalArgumentException.class, () -> service.checkInMember(request));
        verifyNoInteractions(attendanceBookings);
    }

    @Test
    void attendanceRejectsNonMemberAccount() {
        SecurityUtils attendanceSecurity = mock(SecurityUtils.class);
        ClassRepository attendanceClasses = mock(ClassRepository.class);
        UserRepository attendanceUsers = mock(UserRepository.class);
        AttendanceRepository attendance = mock(AttendanceRepository.class);
        ClassBookingRepository attendanceBookings = mock(ClassBookingRepository.class);
        when(attendanceClasses.findById(20)).thenReturn(Optional.of(
                Classes.builder().id(20).coachId(5).status("SCHEDULED").build()));
        when(attendanceUsers.findById(4)).thenReturn(Optional.of(user(4, "COACH")));
        AttendanceServiceImpl service = new AttendanceServiceImpl(
                attendance, attendanceClasses, attendanceBookings, attendanceUsers, attendanceSecurity);
        var request = com.sportscenter.management.dto.Request.AttendanceRequest.builder()
                .classId(20).memberId(4).status("PRESENT").build();

        assertThrows(IllegalArgumentException.class, () -> service.checkInMember(request));
        verifyNoInteractions(attendanceBookings);
    }

    private static User user(int id, String roleName) {
        return User.builder().id(id).role(Role.builder().roleName(roleName).build()).build();
    }
}
