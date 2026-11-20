package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.WorkoutLogDetailRequest;
import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.entity.WorkoutLog;
import com.sportscenter.management.repository.AttendanceRepository;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.WorkoutLogRepository;
import com.sportscenter.management.repository.WorkoutPlanRepository;
import com.sportscenter.management.service.impl.AttendanceServiceImpl;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
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
    void savesAndReadsSportMetricAlongsideExistingFitnessFields() {
        when(users.findById(4)).thenReturn(Optional.of(user(4, "MEMBER")));
        when(users.findById(5)).thenReturn(Optional.of(user(5, "COACH")));
        WorkoutLogRepository logs = mock(WorkoutLogRepository.class);
        WorkoutLogServiceImpl service = new WorkoutLogServiceImpl(
                logs, users, classes, mock(ClassBookingRepository.class), security);
        when(logs.save(any(WorkoutLog.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.createLog(WorkoutLogRequest.builder().memberId(4).coachId(5)
                .details(List.of(
                        WorkoutLogDetailRequest.builder().exerciseName("Bơi 50 m")
                                .metricValue(new BigDecimal("42.5")).metricUnit("seconds").build(),
                        WorkoutLogDetailRequest.builder().exerciseName("Squat").sets(3).reps(10)
                                .weightKg(new BigDecimal("20")).build()))
                .build());

        var saved = org.mockito.ArgumentCaptor.forClass(WorkoutLog.class);
        verify(logs).save(saved.capture());
        when(logs.findByMemberId(4)).thenReturn(List.of(saved.getValue()));
        var details = service.getLogsByMemberId(4).getFirst().getDetails();
        assertEquals("seconds", details.get(0).getMetricUnit());
        assertEquals(new BigDecimal("42.5"), details.get(0).getMetricValue());
        assertNull(details.get(0).getWeightKg());
        assertEquals(3, details.get(1).getSets());
        assertEquals(10, details.get(1).getReps());
        assertEquals(new BigDecimal("20"), details.get(1).getWeightKg());
        assertNull(details.get(1).getMetricUnit());
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
                attendance, attendanceClasses, attendanceBookings, attendanceUsers, attendanceSecurity,
                Clock.system(ZoneId.of("Asia/Ho_Chi_Minh")));
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
                attendance, attendanceClasses, attendanceBookings, attendanceUsers, attendanceSecurity,
                Clock.system(ZoneId.of("Asia/Ho_Chi_Minh")));
        var request = com.sportscenter.management.dto.Request.AttendanceRequest.builder()
                .classId(20).memberId(4).status("PRESENT").build();

        assertThrows(IllegalArgumentException.class, () -> service.checkInMember(request));
        verifyNoInteractions(attendanceBookings);
    }

    private static User user(int id, String roleName) {
        return User.builder().id(id).role(Role.builder().roleName(roleName).build()).build();
    }
}
