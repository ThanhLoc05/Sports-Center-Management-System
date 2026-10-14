package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.LoginRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Response.LoginResponse;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.entity.User;
import com.sportscenter.auth.JwtService;
import com.sportscenter.management.service.UserService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final JwtService jwtService;
    private final SecurityUtils securityUtils;

    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(userService.registerUser(request));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return userService.authenticate(request.getEmail(), request.getPassword())
                .map(user -> LoginResponse.builder()
                        .token(jwtService.generateToken(org.springframework.security.core.userdetails.User
                                .withUsername(user.getEmail())
                                .password(user.getPasswordHash())
                                .authorities("ROLE_" + user.getRole().getRoleName())
                                .build()))
                        .user(toResponse(user))
                        .build())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(401).build());
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER','MANAGER')")
    public List<UserResponse> getUsers(@RequestParam(required = false) Integer roleId) {
        return userService.getAllUsers(roleId);
    }

    @GetMapping("/{userId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserResponse> getUser(@PathVariable Integer userId) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();
        if (!currentUser.equals(userId) && !securityUtils.isManagerOrCenterManager()) {
            return ResponseEntity.status(403).build();
        }
        return userService.getUserById(userId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PatchMapping("/{userId}/status")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER','MANAGER')")
    public UserResponse updateStatus(@PathVariable Integer userId, @RequestParam String status) {
        return userService.updateUserStatus(userId, status);
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .phone(user.getPhone())
                .roleName(user.getRole().getRoleName())
                .status(user.getStatus())
                .build();
    }
}
