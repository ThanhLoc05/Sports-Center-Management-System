package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.LoginRequest;
import com.sportscenter.management.dto.Request.MemberProfileRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Response.LoginResponse;
import com.sportscenter.management.dto.Response.MemberProfileResponse;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.service.BookingService;
import com.sportscenter.management.service.ClassService;
import com.sportscenter.auth.JwtService;
import com.sportscenter.management.service.UserService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ NGƯỜI DÙNG & XÁC THỰC (USER & AUTH CONTROLLER)
 * ============================================================================
 * Phân quyền và luồng nghiệp vụ:
 * 1. Register & Login: Public cho tất cả mọi người.
 * 2. Tra cứu danh sách người dùng (getUsers):
 *    - Dành cho Quản lý trung tâm và Lễ tân để tra cứu học viên tại quầy.
 * 3. Xem và cập nhật thông tin cá nhân (User Details & Member Profile):
 *    - Chính chủ (chủ tài khoản).
 *    - Lễ tân / Quản lý (hỗ trợ cập nhật tại quầy).
 *    - Huấn luyện viên (COACH) được xem Profile học viên để nắm mục tiêu tập luyện (fitness goals).
 * 4. Khóa / Mở tài khoản (updateStatus): Chỉ Quản lý trung tâm mới có quyền.
 * 5. Cập nhật vai trò người dùng (updateRole): Chỉ Quản lý trung tâm mới có quyền.
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

    /**
     * ĐĂNG KÝ TÀI KHOẢN MỚI (DÀNH CHO HỌC VIÊN - MEMBER)
     * - Luồng xử lý: Kiểm tra trùng email, SĐT -> Mã hóa mật khẩu bằng BCrypt -> Gán vai trò mặc định 'MEMBER'.
     */
    @PostMapping("/register")
    public ResponseEntity<UserResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(201).body(userService.registerUser(request));
    }

    /**
     * ĐĂNG NHẬP VÀO HỆ THỐNG (LOGIN)
     * - Luồng xử lý: Đối chiếu mật khẩu băm -> Tạo JWT token mang thông tin email và vai trò (ROLE_...) -> Trả về token.
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
     * - Phân quyền: Quản lý trung tâm xem toàn bộ nhân sự, Lễ tân tìm kiếm học viên tại quầy.
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'RECEPTIONIST')")
    public List<UserResponse> getUsers(@RequestParam(required = false) Integer roleId) {
        return userService.getAllUsers(roleId);
    }

    /**
     * XEM CHI TIẾT THÔNG TIN NGƯỜI DÙNG THEO ID
     * - Bảo mật: Chính chủ tài khoản, Lễ tân, HLV hoặc Quản lý mới được phép xem.
     */
    @GetMapping("/{userId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserResponse> getUser(@PathVariable Integer userId) {
        Integer currentUser = securityUtils.getCurrentUserId();
        if (currentUser == null) return ResponseEntity.status(401).build();

        // Cho phép: Chính chủ HOẶC Lễ tân HOẶC HLV HOẶC Quản lý
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
     * KHÓA / KÍCH HOẠT TÀI KHOẢN (STATUS: ACTIVE / BLOCKED)
     * - Bảo mật: CHỈ Quản lý trung tâm mới có quyền.
     */
    @PatchMapping("/{userId}/status")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public UserResponse updateStatus(@PathVariable Integer userId, @RequestParam String status) {
        return userService.updateUserStatus(userId, status);
    }

    /**
     * CẬP NHẬT VAI TRÒ NGƯỜI DÙNG (ROLE: MEMBER, COACH, RECEPTIONIST, CENTER_MANAGER)
     * - Bảo mật: CHỈ Quản lý trung tâm mới có quyền phân quyền.
     */
    @PatchMapping("/{userId}/role")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public UserResponse updateRole(
            @PathVariable Integer userId,
            @RequestParam(required = false) Integer roleId,
            @RequestParam(required = false) String roleName) {
        return userService.updateUserRole(userId, roleId, roleName);
    }

    /**
     * XEM HỒ SƠ THÀNH VIÊN (MEMBER PROFILE: Ngày sinh, giới tính, mục tiêu tập luyện, liên hệ khẩn cấp)
     * - HLV xem được để theo dõi mục tiêu học viên.
     * - Học viên xem được hồ sơ của mình.
     * - Lễ tân và Quản lý xem được để hỗ trợ.
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
     * CẬP NHẬT HỒ SƠ THÀNH VIÊN (Cập nhật mục tiêu thể hình, địa chỉ, số liên hệ khẩn cấp)
     * - Bảo mật: Chỉ chính học viên hoặc Lễ tân/Quản lý hỗ trợ tại quầy mới được sửa.
     */
    @PutMapping("/{userId}/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<MemberProfileResponse> updateProfile(
            @PathVariable Integer userId, @RequestBody MemberProfileRequest request) {
        if (!securityUtils.isOwnerOrAuthorized(userId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(userService.updateProfile(userId, request));
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

    private boolean coachTeachesMember(Integer coachId, Integer memberId) {
        return bookingService.getMemberBookings(memberId).stream()
                .filter(booking -> "BOOKED".equals(booking.getStatus()))
                .anyMatch(booking -> classService.getClassById(booking.getClassId())
                        .map(clazz -> coachId.equals(clazz.getCoachId()))
                        .orElse(false));
    }
}
