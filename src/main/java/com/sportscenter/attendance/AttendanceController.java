package com.sportscenter.attendance;

import com.sportscenter.attendance.dto.AttendanceRequests;
import com.sportscenter.user.UserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AttendanceController {
    private final AttendanceService service;
    private final UserService users;

    public AttendanceController(AttendanceService service, UserService users) {
        this.service = service;
        this.users = users;
    }

    @PostMapping("/attendance")
    @PreAuthorize("hasRole('COACH')")
    public Map<String, Object> recordAttendance(@AuthenticationPrincipal UserDetails user,
                                                @Valid @RequestBody AttendanceRequests.AttendanceRequest request) {
        return service.recordAttendance(users.memberId(user.getUsername()), request.memberId(),
                request.scheduleId(), request.status());
    }

    @GetMapping("/attendance/mine")
    @PreAuthorize("hasRole('MEMBER')")
    public List<Map<String, Object>> memberAttendance(@AuthenticationPrincipal UserDetails user) {
        return service.memberAttendance(user.getUsername());
    }

    @PostMapping("/attendance/check-in")
    @PreAuthorize("hasAnyRole('MANAGER', 'RECEPTIONIST')")
    public Map<String, Object> checkIn(@Valid @RequestBody AttendanceRequests.CheckInRequest request) {
        return service.checkIn(request.memberId());
    }
}
