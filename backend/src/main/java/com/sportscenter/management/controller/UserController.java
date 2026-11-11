package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.ChangePasswordRequest;
import com.sportscenter.management.dto.Request.CoachProfileRequest;
import com.sportscenter.management.dto.Request.LoginRequest;
import com.sportscenter.management.dto.Request.MemberProfileRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Request.UpdateStaffDetailsRequest;
import com.sportscenter.management.dto.Response.LoginResponse;
import com.sportscenter.management.dto.Response.CoachProfileResponse;
import com.sportscenter.management.dto.Response.MemberProfileResponse;
import com.sportscenter.management.dto.Response.MemberProfileUpdateResponse;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.CoachProfileService;
import com.sportscenter.management.service.ClassService;
import com.sportscenter.auth.JwtService;
import com.sportscenter.management.service.UserService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.UNAUTHORIZED;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ NGƯỜI DÙNG & XÁC THỰC (USER & AUTH CONTROLLER)
 * ============================================================================
 * Phân quyền và luồng nghiệp vụ:
 * 1. Register & Login: Public cho tất cả mọi người.
 * 2. Tra cứu danh sách người dùng (getUsers):
 *    - Dành cho Quản lý trung tâm và Lễ tân để tra cứu học viên tại quầy theo họ tên, SĐT, email.
 * 3. Xem và cập nhật thông tin cá nhân (User Details & Member Profile):
 *    - Chính chủ (chủ tài khoản).
 *    - Lễ tân / Quản lý (hỗ trợ cập nhật tại quầy).
 *    - Huấn luyện viên (COACH) được xem Profile học viên để nắm mục tiêu tập luyện (fitness goals).
 * 4. Khóa / Mở tài khoản (updateStatus): Chỉ Quản lý trung tâm mới có quyền.
 * 5. Cập nhật vai trò người dùng (updateRole): Chỉ Quản lý trung tâm mới có quyền.
 * 6. Đổi mật khẩu / Khôi phục mật khẩu (changePassword): Chính chủ hoặc Quản lý.
 */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final JwtService jwtService;
    private final SecurityUtils securityUtils;
    private final BookingService bookingService;
    private final ClassService classService;
    private final CoachProfileService coachProfileService;

    /**
     * ĐĂNG KÝ TÀI KHOẢN MỚI (DÀNH CHO HỌC VIÊN - MEMBER HOẶC LỄ TÂN TẠO TẠI QUẦY)
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(userService.registerUser(request));
    }

    @PostMapping("/members")
    @PreAuthorize("hasAnyRole('CENTER_MANAGER','RECEPTIONIST')")
    public ResponseEntity<UserResponse> createMember(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(userService.createMemberByStaff(request, securityUtils.getCurrentUserId()));
    }

    @PostMapping("/staff")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<UserResponse> createStaff(@Valid @RequestBody com.sportscenter.management.dto.Request.CreateStaffRequest request) {
        return ResponseEntity.status(201).body(userService.createStaff(request, securityUtils.getCurrentUserId()));
    }

    /**
     * ĐĂNG NHẬP VÀO HỆ THỐNG (LOGIN)
     */
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

    /**
     * TÌM KIẾM VÀ XEM DANH SÁCH NGƯỜI DÙNG
     * - Quản lý trung tâm và Lễ tân tìm kiếm học viên tại quầy theo từ khóa (họ tên, email, SĐT) và trạng thái.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST')")
    public List<UserResponse> getUsers(
            @RequestParam(required = false) Integer roleId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        if (keyword != null || status != null) {
            return userService.searchUsers(roleId, status, keyword);
        }
        return userService.getAllUsers(roleId);
    }

    /**
     * XEM CHI TIẾT THÔNG TIN NGƯỜI DÙNG THEO ID
     */
    @GetMapping("/{userId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserResponse> getUser(@PathVariable Integer userId) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();

        boolean isAuthorized = currentUser.equals(userId)
                || securityUtils.isCenterManager()
                || securityUtils.isReceptionist();

        if (!isAuthorized) {
            return ResponseEntity.status(403).build();
        }

        return userService.getUserById(userId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * KHÓA / KÍCH HOẠT TÀI KHOẢN (STATUS: ACTIVE / BLOCKED / INACTIVE)
     */
    @PatchMapping("/{userId}/status")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public UserResponse updateStatus(@PathVariable Integer userId, @RequestParam String status) {
        Integer actorId = securityUtils.getCurrentUserId();
        if (actorId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Yêu cầu đăng nhập.");
        }
        return userService.updateUserStatus(userId, status, actorId);
    }

    /**
     * CẬP NHẬT VAI TRÒ NGƯỜI DÙNG (ROLE: MEMBER, COACH, RECEPTIONIST, CENTER_MANAGER)
     */
    @PatchMapping("/{userId}/role")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public UserResponse updateRole(
            @PathVariable Integer userId,
            @RequestParam(required = false) Integer roleId,
            @RequestParam(required = false) String roleName) {
        Integer actorId = securityUtils.getCurrentUserId();
        if (actorId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Yêu cầu đăng nhập.");
        }
        return userService.updateUserRole(userId, roleId, roleName, actorId);
    }

    /**
     * Cập nhật thông tin liên hệ của HLV/nhân viên; không thay đổi vai trò hoặc trạng thái.
     */
    @PutMapping("/{userId}/details")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public UserResponse updateStaffDetails(
            @PathVariable Integer userId,
            @Valid @RequestBody UpdateStaffDetailsRequest request) {
        Integer actorId = securityUtils.getCurrentUserId();
        if (actorId == null) {
            throw new ResponseStatusException(UNAUTHORIZED, "Yêu cầu đăng nhập.");
        }
        return userService.updateStaffDetails(userId, actorId, request);
    }

    /**
     * ĐỔI MẬT KHẨU / KHÔI PHỤC MẬT KHẨU
     * - Chính chủ nhập mật khẩu cũ + mới.
     * - Quản lý trung tâm có quyền đặt lại mật khẩu cho thành viên/nhân viên mà không cần mật khẩu cũ.
     */
    @PostMapping("/{userId}/change-password")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> changePassword(
            @PathVariable Integer userId,
            @Valid @RequestBody ChangePasswordRequest request) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();

        boolean isAuthorized = currentUser.equals(userId) || securityUtils.isCenterManager();
        if (!isAuthorized) {
            return ResponseEntity.status(403).build();
        }

        boolean isAdminReset = securityUtils.isCenterManager() && !currentUser.equals(userId);
        userService.changePassword(userId, request.getOldPassword(), request.getNewPassword(), isAdminReset);
        return ResponseEntity.ok().build();
    }

    /**
     * XEM HỒ SƠ THÀNH VIÊN
     */
    @GetMapping("/{userId}/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberProfileResponse> getProfile(@PathVariable Integer userId) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();

        boolean isAuthorized = currentUser.equals(userId)
                || securityUtils.isCenterManager()
                || securityUtils.isReceptionist()
                || (securityUtils.isCoach() && coachTeachesMember(currentUser, userId));

        if (!isAuthorized) {
            return ResponseEntity.status(403).build();
        }

        return userService.getProfile(userId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Hồ sơ nghề nghiệp công khai của HLV; chỉ trả các trường không nhạy cảm.
     */
    @GetMapping("/coaches")
    @PreAuthorize("hasAnyRole('MEMBER', 'COACH', 'RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<List<CoachProfileResponse>> getCoaches() {
        return ResponseEntity.ok(coachProfileService.getActiveProfiles());
    }

    @GetMapping("/{userId}/coach-profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CoachProfileResponse> getCoachProfile(@PathVariable Integer userId) {
        return ResponseEntity.ok(coachProfileService.getProfile(userId));
    }

    /**
     * HLV chỉ tự sửa hồ sơ nghề nghiệp; quản lý trung tâm được hỗ trợ cập nhật.
     */
    @PutMapping("/{userId}/coach-profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<CoachProfileResponse> updateCoachProfile(
            @PathVariable Integer userId, @Valid @RequestBody CoachProfileRequest request) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();
        if (!currentUser.equals(userId) && !securityUtils.isCenterManager()) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(coachProfileService.updateProfile(userId, request));
    }

    /**
     * CẬP NHẬT HỒ SƠ THÀNH VIÊN
     */
    @PutMapping("/{userId}/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberProfileUpdateResponse> updateProfile(
            @PathVariable Integer userId, @Valid @RequestBody MemberProfileRequest request) {
        Integer actorId = securityUtils.getCurrentUserId();
        if (!securityUtils.isOwnerOrAuthorized(userId)) {
            return ResponseEntity.status(403).build();
        }
        MemberProfileResponse profile = userService.updateProfile(userId, request);
        UserResponse updatedUser = userService.getUserById(userId)
                .orElseThrow(() -> new IllegalStateException("Không tìm thấy tài khoản sau khi cập nhật hồ sơ"));
        String refreshedToken = null;
        if (userId.equals(actorId)) {
            refreshedToken = jwtService.generateToken(
                    org.springframework.security.core.userdetails.User
                            .withUsername(updatedUser.getEmail())
                            .password("")
                            .authorities("ROLE_" + updatedUser.getRoleName())
                            .build());
        }
        return ResponseEntity.ok(MemberProfileUpdateResponse.builder()
                .profile(profile)
                .user(updatedUser)
                .token(refreshedToken)
                .build());
    }

    private UserResponse toResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .pendingEmail(user.getPendingEmail())
                .fullName(user.getFullName())
                .phone(user.getPhone())
                .roleName(user.getRole().getRoleName())
                .status(user.getStatus())
                .build();
    }

    private boolean coachTeachesMember(Integer coachId, Integer memberId) {
        return bookingService.getMemberBookings(memberId).stream()
                .filter(booking -> "BOOKED".equals(booking.getStatus()))
                .anyMatch(booking -> classService.getClassById(booking.getClassId())
                        .map(clazz -> coachId.equals(clazz.getCoachId()))
                        .orElse(false));
    }
}
