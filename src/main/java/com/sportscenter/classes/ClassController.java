package com.sportscenter.classes;

import com.sportscenter.classes.dto.ClassRequests;
import com.sportscenter.user.UserService;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ClassController {
    private final ClassService service;
    private final UserService users;

    public ClassController(ClassService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @GetMapping("/classes")
    public List<Map<String, Object>> classes() { return service.classes(); }

    @PostMapping("/classes")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> createClass(@Valid @RequestBody ClassRequests.ClassRequest request) {
        return service.createClass(request.name(), request.description(), request.maxCapacity());
    }

    @GetMapping("/rooms")
    public List<Map<String, Object>> rooms() { return service.rooms(); }

    @PostMapping("/rooms")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> createRoom(@Valid @RequestBody ClassRequests.RoomRequest request) {
        return service.createRoom(request.name(), request.capacity(), request.description());
    }

    @GetMapping("/classes/schedules")
    public List<Map<String, Object>> schedules(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return service.schedules(from, to);
    }

    @PostMapping("/classes/schedules")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> createSchedule(@Valid @RequestBody ClassRequests.ScheduleRequest request) {
        return service.createSchedule(request.classId(), request.coachId(), request.roomId(),
                request.startTime(), request.endTime());
    }

    @PostMapping("/classes/schedules/{scheduleId}/enroll")
    @PreAuthorize("hasRole('MEMBER')")
    public Map<String, Object> enroll(@AuthenticationPrincipal UserDetails user, @PathVariable long scheduleId) {
        return service.enroll(users.memberId(user.getUsername()), scheduleId);
    }

    @PostMapping("/members/{memberId}/classes/schedules/{scheduleId}/enroll")
    @PreAuthorize("hasAnyRole('MANAGER', 'RECEPTIONIST')")
    public Map<String, Object> enrollMember(@PathVariable long memberId, @PathVariable long scheduleId) {
        return service.enroll(memberId, scheduleId);
    }

    @GetMapping("/classes/enrollments/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> enrollments(@AuthenticationPrincipal UserDetails user) {
        return service.enrollments(user.getUsername());
    }

    @PostMapping("/classes/enrollments/{enrollmentId}/cancel")
    @PreAuthorize("hasRole('MEMBER')")
    public Map<String, String> cancelEnrollment(@AuthenticationPrincipal UserDetails user,
                                                @PathVariable long enrollmentId) {
        service.cancelEnrollment(users.memberId(user.getUsername()), enrollmentId);
        return Map.of("message", "Đã hủy đăng ký lớp.");
    }

    @GetMapping("/coaching/schedules")
    @PreAuthorize("hasRole('COACH')")
    public List<Map<String, Object>> coachSchedules(@AuthenticationPrincipal UserDetails user) {
        return service.coachSchedules(user.getUsername());
    }

    @GetMapping("/coaching/schedules/{scheduleId}/members")
    @PreAuthorize("hasRole('COACH')")
    public List<Map<String, Object>> scheduleMembers(@AuthenticationPrincipal UserDetails user,
                                                     @PathVariable long scheduleId) {
        return service.scheduleMembers(scheduleId, user.getUsername());
    }
}
