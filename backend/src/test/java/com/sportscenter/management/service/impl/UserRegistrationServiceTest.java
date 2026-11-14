package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.CreateStaffRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.AccountActionService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserRegistrationServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final AccountActionService actions = mock(AccountActionService.class);
    private final UserServiceImpl service = new UserServiceImpl(
            users, roles, passwords, mock(MemberProfileRepository.class), actions);
    private final Role member = Role.builder().id(1).roleName("MEMBER").build();
    private final Role coach = Role.builder().id(2).roleName("COACH").build();
    private final Role manager = Role.builder().id(3).roleName("CENTER_MANAGER").build();

    @Test
    void publicSignupCreatesMemberReadyToLoginWithoutSendingEmail() {
        when(roles.findByRoleName("MEMBER")).thenReturn(Optional.of(member));
        when(passwords.encode("strong-password")).thenReturn("password-hash");
        when(users.save(any(User.class))).thenAnswer(call -> {
            User saved = call.getArgument(0);
            saved.setId(10);
            return saved;
        });

        var result = service.registerUser(RegisterRequest.builder()
                .email(" member@example.com ").password("strong-password")
                .fullName("Member Example").phone("0912345678").build());

        assertEquals("member@example.com", result.getEmail());
        assertEquals("MEMBER", result.getRoleName());
        verify(users).save(argThat(user -> user.getId().equals(10)
                && user.isEmailVerified() && "ACTIVE".equals(user.getStatus())
                && "password-hash".equals(user.getPasswordHash())));
        verifyNoInteractions(actions);
        // Tài khoản vừa tạo đăng nhập bằng mật khẩu đã được mã hóa.
        User saved = User.builder().id(10).email("member@example.com").role(member)
                .status("ACTIVE").emailVerified(true).passwordHash("password-hash").build();
        when(users.findByEmail(saved.getEmail())).thenReturn(Optional.of(saved));
        when(passwords.matches("strong-password", "password-hash")).thenReturn(true);
        assertTrue(service.authenticate(saved.getEmail(), "strong-password").isPresent());
    }

    @Test
    void internalMemberAndStaffProvisioningAreVerifiedAndRoleRestricted() {
        User actor = User.builder().id(20).role(manager).build();
        when(users.findById(20)).thenReturn(Optional.of(actor));
        when(roles.findByRoleName("MEMBER")).thenReturn(Optional.of(member));
        when(roles.findByRoleName("COACH")).thenReturn(Optional.of(coach));
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
        when(passwords.encode(anyString())).thenReturn("password-hash");

        var memberResult = service.createMemberByStaff(
                RegisterRequest.builder().email("member@example.com")
                        .password("strong-password").fullName("Member Example")
                        .phone("0912345678").build(), 20);
        var coachResult = service.createStaff(
                CreateStaffRequest.builder().email("coach@example.test")
                        .password("strong-password").fullName("Coach Example")
                        .phone("0912345679").roleName("COACH").build(), 20);

        assertEquals("MEMBER", memberResult.getRoleName());
        assertEquals("COACH", coachResult.getRoleName());
        verify(actions, never()).sendSignupVerification(any());
    }

    @Test
    void rejectsStaffProvisioningByNonManager() {
        when(users.findById(20)).thenReturn(Optional.of(
                User.builder().id(20).role(member).build()));

        assertThrows(IllegalArgumentException.class, () -> service.createStaff(
                CreateStaffRequest.builder().email("coach@example.test")
                        .password("strong-password").fullName("Coach Example")
                        .phone("0912345679").roleName("COACH").build(), 20));
    }

    @Test void unverifiedMemberCannotLoginButExistingVerifiedMemberCan() {
        var user=User.builder().id(10).email("member@example.com").status("ACTIVE")
                .passwordHash("test-hash").emailVerified(false).role(member).build();
        when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
        when(passwords.matches("test-password","test-hash")).thenReturn(true);
        assertTrue(service.authenticate(user.getEmail(),"test-password").isEmpty());
        user.setEmailVerified(true);
        assertTrue(service.authenticate(" member@example.com ","test-password").isPresent());
    }

    @Test void reservedPendingEmailCannotBeUsedForAnotherSignup() {
        when(users.existsByPendingEmailIgnoreCaseAndIdNot("reserved@example.com",-1)).thenReturn(true);
        assertThrows(IllegalArgumentException.class,()->service.registerUser(RegisterRequest.builder()
                .email("reserved@example.com").password("test-password").fullName("Member Test").phone("0900000010").build()));
        verify(users,never()).save(any());verifyNoInteractions(actions);
    }
}
