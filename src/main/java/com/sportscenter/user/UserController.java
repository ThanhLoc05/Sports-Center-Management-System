package com.sportscenter.user;

import com.sportscenter.user.dto.UserRequests;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class UserController {
    private final UserService service;

    public UserController(UserService service) { this.service = service; }

    @GetMapping("/members/me/profile")
    @PreAuthorize("hasRole('MEMBER')")
    public Map<String, Object> memberProfile(@AuthenticationPrincipal UserDetails user) {
        return service.memberProfile(user.getUsername());
    }

    @PutMapping("/members/me/profile")
    @PreAuthorize("hasRole('MEMBER')")
    public Map<String, Object> updateMemberProfile(@AuthenticationPrincipal UserDetails user,
                                                   @Valid @RequestBody UserRequests.MemberProfileRequest request) {
        return service.updateMemberProfile(service.memberId(user.getUsername()), request.dateOfBirth(),
                request.gender(), request.address(), request.fitnessGoal(), request.emergencyContact());
    }

    @PutMapping("/members/{memberId}/profile")
    @PreAuthorize("hasAnyRole('MANAGER', 'RECEPTIONIST')")
    public Map<String, Object> updateMemberProfile(@PathVariable long memberId,
                                                   @Valid @RequestBody UserRequests.MemberProfileRequest request) {
        return service.updateMemberProfile(memberId, request.dateOfBirth(), request.gender(), request.address(),
                request.fitnessGoal(), request.emergencyContact());
    }

    @GetMapping("/members")
    @PreAuthorize("hasAnyRole('MANAGER', 'RECEPTIONIST')")
    public List<Map<String, Object>> members(@RequestParam(required = false) String query) {
        return service.findMembers(query);
    }

    @GetMapping("/users")
    @PreAuthorize("hasRole('MANAGER')")
    public List<Map<String, Object>> users(@RequestParam(required = false) String query,
                                           @RequestParam(required = false) String role) {
        return service.findUsers(query, role);
    }

    @PostMapping("/users")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> createStaff(@Valid @RequestBody UserRequests.StaffRegistration request) {
        return service.createStaff(request.email(), request.password(), request.fullName(), request.phone(), request.role());
    }

    @PatchMapping("/users/{userId}/status")
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> updateUserStatus(@AuthenticationPrincipal UserDetails user,
                                                @PathVariable long userId,
                                                @Valid @RequestBody UserRequests.UserStatusRequest request) {
        return service.updateUserStatus(userId, request.status(), user.getUsername());
    }
}
