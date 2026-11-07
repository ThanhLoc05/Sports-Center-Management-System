package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.UpdateStaffDetailsRequest;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StaffDetailsServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final MemberProfileRepository profiles = mock(MemberProfileRepository.class);
    private final UserServiceImpl service = new UserServiceImpl(users, roles, passwords, profiles);

    private final User coach = User.builder()
            .id(4)
            .email("coach@example.com")
            .fullName("Coach")
            .phone("0900000000")
            .role(Role.builder().roleName("COACH").build())
            .status("ACTIVE")
            .build();

    @Test
    void updatesStaffContactFieldsAndKeepsRoleAndStatus() {
        when(users.findById(4)).thenReturn(Optional.of(coach));
        when(users.save(coach)).thenReturn(coach);

        var result = service.updateStaffDetails(4, 1, UpdateStaffDetailsRequest.builder()
                .fullName("Nguyễn Minh Anh")
                .email("MINH.ANH@example.com")
                .phone("+84900000000")
                .build());

        assertEquals("Nguyễn Minh Anh", result.getFullName());
        assertEquals("minh.anh@example.com", result.getEmail());
        assertEquals("+84900000000", result.getPhone());
        assertEquals("COACH", result.getRoleName());
        assertEquals("ACTIVE", result.getStatus());
        verify(users).save(coach);
    }

    @Test
    void rejectsEmailAlreadyUsedByAnotherAccount() {
        when(users.findById(4)).thenReturn(Optional.of(coach));
        when(users.existsByEmailIgnoreCaseAndIdNot("other@example.com", 4)).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> service.updateStaffDetails(
                4, 1, UpdateStaffDetailsRequest.builder()
                        .fullName("Coach")
                        .email("other@example.com")
                        .phone("0900000000")
                        .build()));
        verify(users, never()).save(any());
    }

    @Test
    void rejectsPhoneAlreadyUsedByAnotherAccount() {
        when(users.findById(4)).thenReturn(Optional.of(coach));
        when(users.existsByPhoneAndIdNot("0900000001", 4)).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> service.updateStaffDetails(
                4, 1, UpdateStaffDetailsRequest.builder()
                        .fullName("Coach")
                        .email("coach@example.com")
                        .phone("0900000001")
                        .build()));
        verify(users, never()).save(any());
    }

    @Test
    void rejectsInvalidPhoneNumber() {
        when(users.findById(4)).thenReturn(Optional.of(coach));

        assertThrows(IllegalArgumentException.class, () -> service.updateStaffDetails(
                4, 1, UpdateStaffDetailsRequest.builder()
                        .fullName("Coach")
                        .email("coach@example.com")
                        .phone("abc")
                        .build()));
        verify(users, never()).save(any());
    }

    @Test
    void preventsChangingEmailOfCurrentManagerSession() {
        coach.setRole(Role.builder().roleName("CENTER_MANAGER").build());
        when(users.findById(4)).thenReturn(Optional.of(coach));

        assertThrows(IllegalArgumentException.class, () -> service.updateStaffDetails(
                4, 4, UpdateStaffDetailsRequest.builder()
                        .fullName("Coach")
                        .email("new@example.com")
                        .phone("0900000000")
                        .build()));
        verify(users, never()).save(any());
    }

    @Test
    void rejectsMemberAccounts() {
        coach.setRole(Role.builder().roleName("MEMBER").build());
        when(users.findById(4)).thenReturn(Optional.of(coach));

        assertThrows(IllegalArgumentException.class, () -> service.updateStaffDetails(
                4, 1, UpdateStaffDetailsRequest.builder()
                        .fullName("Member")
                        .email("member@example.com")
                        .phone("0900000000")
                        .build()));
        verify(users, never()).save(any());
    }
}
