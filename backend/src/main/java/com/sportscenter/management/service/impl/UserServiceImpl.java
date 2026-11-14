package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberProfileRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Request.UpdateStaffDetailsRequest;
import com.sportscenter.management.dto.Response.MemberProfileResponse;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.entity.MemberProfile;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final MemberProfileRepository profileRepository;
    private final com.sportscenter.management.service.AccountActionService accountActions;

    @Override
    public UserResponse registerUser(RegisterRequest request) {
        validateMemberRegistrationEmail(request == null ? null : request.getEmail());
        // Đăng ký trực tiếp cho buổi demo; dùng lại kiểm tra trùng và mã hóa mật khẩu hiện có.
        // Gán đủ điều kiện đăng nhập ngay để không cần gửi hoặc nhập mã xác minh email.
        return mapToUserResponse(createAccount(request, "MEMBER", true));
    }

    @Override
    public UserResponse createMemberByStaff(RegisterRequest request, Integer actorId) {
        var actor = userRepository.findById(actorId).orElseThrow(() -> new IllegalArgumentException("Actor not found"));
        if (actor.getRole() == null || !List.of("CENTER_MANAGER", "RECEPTIONIST").contains(actor.getRole().getRoleName()))
            throw new IllegalArgumentException("Staff access required");
        validateMemberRegistrationEmail(request == null ? null : request.getEmail());
        return mapToUserResponse(createAccount(request, "MEMBER", true));
    }

    @Override
    public UserResponse createStaff(com.sportscenter.management.dto.Request.CreateStaffRequest input, Integer actorId) {
        var actor = userRepository.findById(actorId).orElseThrow(() -> new IllegalArgumentException("Actor not found"));
        if (actor.getRole() == null || !"CENTER_MANAGER".equals(actor.getRole().getRoleName()))
            throw new IllegalArgumentException("Manager access required");
        if (input == null || !List.of("COACH", "RECEPTIONIST", "CENTER_MANAGER").contains(input.getRoleName()))
            throw new IllegalArgumentException("Invalid staff role");
        return mapToUserResponse(createAccount(RegisterRequest.builder().email(input.getEmail())
                .password(input.getPassword()).fullName(input.getFullName()).phone(input.getPhone()).build(), input.getRoleName(), true));
    }

    private User createAccount(RegisterRequest request, String roleName, boolean verified) {
        if (request == null || request.getEmail() == null || request.getPassword() == null
                || request.getFullName() == null || request.getPhone() == null)
            throw new IllegalArgumentException("Account fields are required");
        String email = request.getEmail().trim().toLowerCase(java.util.Locale.ROOT);
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || email.length() > 255)
            throw new IllegalArgumentException("Email không đúng định dạng.");
        int minimumPasswordLength = "MEMBER".equals(roleName) ? 6 : 8;
        if (request.getPassword().length() < minimumPasswordLength || request.getPassword().length() > 128)
            throw new IllegalArgumentException("Mật khẩu phải có từ " + minimumPasswordLength + " đến 128 ký tự.");
        String fullName = request.getFullName().trim();
        String phone = request.getPhone().trim();
        if (fullName.length() < 2 || fullName.length() > 100)
            throw new IllegalArgumentException("Họ và tên phải có từ 2 đến 100 ký tự.");
        if (!phone.matches("[+0-9 ()-]{9,20}"))
            throw new IllegalArgumentException("Số điện thoại không đúng định dạng.");
        if (userRepository.existsByEmail(email) || userRepository.existsByEmailIgnoreCaseAndIdNot(email, -1)
                || userRepository.existsByPendingEmailIgnoreCaseAndIdNot(email, -1))
            throw new IllegalArgumentException("Email đã được sử dụng.");
        if (userRepository.existsByPhone(phone))
            throw new IllegalArgumentException("Số điện thoại đã được sử dụng.");
        Role role = roleRepository.findByRoleName(roleName).orElseThrow(() -> new IllegalStateException("Role not configured"));
        return userRepository.save(User.builder().email(email).passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(fullName).phone(phone).role(role).status("ACTIVE")
                .emailVerified(verified).createdAt(LocalDateTime.now()).build());
    }

    /** Áp dụng rule địa chỉ .com viết thường cho Member; tài khoản nhân viên dùng DTO riêng. */
    private void validateMemberRegistrationEmail(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim();
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || !email.endsWith(".com") || email.length() > 255)
            throw new IllegalArgumentException("Email phải đúng định dạng và kết thúc bằng .com viết thường.");
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserResponse> getUserById(Integer userId) {
        return userRepository.findById(userId)
                .map(this::mapToUserResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<User> getUserByEmail(String email) {
        return userRepository.findByEmail(email);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers(Integer roleId) {
        List<User> users;
        if (roleId != null) {
            users = userRepository.findByRole_Id(roleId);
        } else {
            users = userRepository.findAll();
        }
        return users.stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponse> searchUsers(Integer roleId, String status, String keyword) {
        String cleanKeyword = (keyword != null && !keyword.isBlank()) ? keyword.trim() : null;
        String cleanStatus = (status != null && !status.isBlank()) ? status.trim().toUpperCase() : null;

        List<User> users = userRepository.searchUsers(roleId, cleanStatus, cleanKeyword);
        return users.stream()
                .map(this::mapToUserResponse)
                .collect(Collectors.toList());
    }

    @Override
    public UserResponse updateUserStatus(Integer userId, String status, Integer actorId) {
        List<User> managers = userRepository.findCenterManagersForUpdate();
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new IllegalArgumentException("Người dùng không tồn tại"));

        if (!isValidStatus(status)) {
            throw new IllegalArgumentException("Trạng thái không hợp lệ");
        }
        if (userId.equals(actorId) && !"ACTIVE".equals(status)) {
            throw new IllegalArgumentException("Không thể tự khóa hoặc vô hiệu hóa tài khoản quản lý đang đăng nhập");
        }
        if (isActiveCenterManager(user) && !"ACTIVE".equals(status)
                && countActiveManagers(managers) <= 1) {
            throw new IllegalArgumentException("Không thể vô hiệu hóa quản lý trung tâm đang hoạt động cuối cùng");
        }

        user.setStatus(status);
        User updatedUser = userRepository.save(user);
        return mapToUserResponse(updatedUser);
    }

    @Override
    public UserResponse updateUserRole(Integer userId, Integer roleId, String roleName, Integer actorId) {
        List<User> managers = userRepository.findCenterManagersForUpdate();
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new IllegalArgumentException("Người dùng không tồn tại"));

        Role newRole;
        if (roleId != null) {
            newRole = roleRepository.findById(roleId)
                    .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy vai trò với ID: " + roleId));
        } else if (roleName != null && !roleName.isBlank()) {
            newRole = roleRepository.findByRoleName(roleName.toUpperCase().trim())
                    .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy vai trò với tên: " + roleName));
        } else {
            throw new IllegalArgumentException("Cần cung cấp roleId hoặc roleName để cập nhật vai trò");
        }

        if (userId.equals(actorId) && !"CENTER_MANAGER".equals(newRole.getRoleName())) {
            throw new IllegalArgumentException("Không thể tự hạ vai trò của tài khoản quản lý đang đăng nhập");
        }
        if (isActiveCenterManager(user) && !"CENTER_MANAGER".equals(newRole.getRoleName())
                && countActiveManagers(managers) <= 1) {
            throw new IllegalArgumentException("Không thể hạ quyền quản lý trung tâm đang hoạt động cuối cùng");
        }

        user.setRole(newRole);
        User updatedUser = userRepository.save(user);
        return mapToUserResponse(updatedUser);
    }

    private boolean isActiveCenterManager(User user) {
        return "CENTER_MANAGER".equals(user.getRole().getRoleName()) && "ACTIVE".equals(user.getStatus());
    }

    private long countActiveManagers(List<User> managers) {
        return managers.stream().filter(this::isActiveCenterManager).count();
    }

    @Override
    public UserResponse updateStaffDetails(Integer userId, Integer actorId, UpdateStaffDetailsRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin nhân viên không được để trống");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Người dùng không tồn tại"));
        String roleName = user.getRole().getRoleName();
        if (!List.of("COACH", "RECEPTIONIST", "CENTER_MANAGER").contains(roleName)) {
            throw new IllegalArgumentException("Chỉ có thể cập nhật thông tin tài khoản nhân viên");
        }

        String email = request.getEmail().trim().toLowerCase();
        String fullName = request.getFullName().trim();
        String phone = request.getPhone().trim();
        if (fullName.length() < 2 || fullName.length() > 100) {
            throw new IllegalArgumentException("Họ tên phải có từ 2 đến 100 ký tự");
        }
        if (!phone.matches("[+0-9 ()-]{9,20}")) {
            throw new IllegalArgumentException("Số điện thoại không hợp lệ");
        }
        if (!email.equalsIgnoreCase(user.getEmail())
                && userRepository.existsByEmailIgnoreCaseAndIdNot(email, userId)) {
            throw new IllegalArgumentException("Email đã được sử dụng");
        }
        if (!phone.equals(user.getPhone()) && userRepository.existsByPhoneAndIdNot(phone, userId)) {
            throw new IllegalArgumentException("Số điện thoại đã được sử dụng");
        }
        if (userId.equals(actorId) && !email.equalsIgnoreCase(user.getEmail())) {
            throw new IllegalArgumentException("Không thể đổi email của tài khoản đang đăng nhập; hãy dùng tài khoản quản lý khác");
        }

        user.setEmail(email);
        user.setFullName(fullName);
        user.setPhone(phone);
        return mapToUserResponse(userRepository.save(user));
    }

    @Override
    public void changePassword(Integer userId, String oldPassword, String newPassword, boolean isAdminReset) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Người dùng không tồn tại"));

        if (!isAdminReset) {
            if (oldPassword == null || !passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
                throw new IllegalArgumentException("Mật khẩu hiện tại không chính xác");
            }
        }

        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("Mật khẩu mới phải có ít nhất 6 ký tự");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<User> authenticate(String email, String password) {
        Optional<User> user = getUserByEmail(email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT));
        if (user.isPresent() && user.get().isEmailVerified() && "ACTIVE".equals(user.get().getStatus())
                && passwordEncoder.matches(password, user.get().getPasswordHash())) {
            return user;
        }
        return Optional.empty();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByEmail(String email) {
        return userRepository.existsByEmail(email);
    }

    private UserResponse mapToUserResponse(User user) {
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

    private boolean isValidStatus(String status) {
        return "ACTIVE".equals(status) || "INACTIVE".equals(status) || "BLOCKED".equals(status);
    }

    @Override
    public MemberProfileResponse updateProfile(Integer memberId, MemberProfileRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin hồ sơ không được để trống");
        }
        User user = userRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new IllegalArgumentException("Người dùng không tồn tại"));
        boolean hasAccountChanges = request.getFullName() != null
                || request.getEmail() != null
                || request.getPhone() != null;
        if (hasAccountChanges && (user.getRole() == null
                || !"MEMBER".equals(user.getRole().getRoleName()))) {
            throw new IllegalArgumentException("Chỉ thành viên mới có thể cập nhật thông tin tài khoản tại đây");
        }
        if (request.getFullName() != null) {
            String fullName = request.getFullName().trim();
            if (fullName.length() < 2 || fullName.length() > 100) {
                throw new IllegalArgumentException("Họ tên phải có từ 2 đến 100 ký tự");
            }
            user.setFullName(fullName);
        }
        if (request.getEmail() != null) {
            String email = request.getEmail().trim().toLowerCase();
            if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$") || email.length() > 255) {
                throw new IllegalArgumentException("Email không hợp lệ");
            }
            if (!email.equalsIgnoreCase(user.getEmail())
                    && (userRepository.existsByEmailIgnoreCaseAndIdNot(email, memberId)
                        || userRepository.existsByPendingEmailIgnoreCaseAndIdNot(email, memberId))) {
                throw new IllegalArgumentException("Email đã được sử dụng");
            }
            if (!email.equalsIgnoreCase(user.getEmail()) && !email.equalsIgnoreCase(user.getPendingEmail())) {
                user.setPendingEmail(email);
                accountActions.sendPendingEmailVerification(user, email);
            }
        }
        if (request.getPhone() != null) {
            String phone = request.getPhone().trim();
            if (!phone.matches("[+0-9 ()-]{9,20}")) {
                throw new IllegalArgumentException("Số điện thoại không hợp lệ");
            }
            if (!phone.equals(user.getPhone()) && userRepository.existsByPhoneAndIdNot(phone, memberId)) {
                throw new IllegalArgumentException("Số điện thoại đã được sử dụng");
            }
            user.setPhone(phone);
        }
        userRepository.save(user);

        MemberProfile profile = profileRepository.findById(memberId)
                // Để ID null cho persist; @MapsId lấy khóa từ user, tránh merge nhầm hồ sơ mới.
                .orElseGet(() -> MemberProfile.builder().build());
        profile.setUser(user);

        profile.setDob(request.getDob());
        profile.setGender(request.getGender());
        profile.setAddress(request.getAddress());
        profile.setFitnessGoals(request.getFitnessGoals());

        MemberProfile saved = profileRepository.save(profile);
        return MemberProfileResponse.builder()
                .memberId(saved.getMemberId())
                .fullName(user.getFullName())
                .email(user.getEmail())
                .pendingEmail(user.getPendingEmail())
                .phone(user.getPhone())
                .dob(saved.getDob())
                .gender(saved.getGender())
                .address(saved.getAddress())
                .fitnessGoals(saved.getFitnessGoals())
                .build();
    }

    @Override
    public Optional<MemberProfileResponse> getProfile(Integer memberId) {
        return profileRepository.findById(memberId).map(p -> {
            User user = p.getUser();
            return MemberProfileResponse.builder()
                    .memberId(p.getMemberId())
                    .fullName(user.getFullName())
                    .email(user.getEmail())
                .pendingEmail(user.getPendingEmail())
                    .phone(user.getPhone())
                    .dob(p.getDob())
                    .gender(p.getGender())
                    .address(p.getAddress())
                    .fitnessGoals(p.getFitnessGoals())
                    .build();
        });
    }
}
