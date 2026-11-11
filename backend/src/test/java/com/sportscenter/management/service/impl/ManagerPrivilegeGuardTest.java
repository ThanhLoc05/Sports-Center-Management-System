package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ManagerPrivilegeGuardTest {

    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final MemberProfileRepository profiles = mock(MemberProfileRepository.class);
    private final UserServiceImpl service = new UserServiceImpl(users, roles, passwords, profiles, mock(com.sportscenter.management.service.AccountActionService.class));

    private final Role managerRole = Role.builder().id(1).roleName("CENTER_MANAGER").build();
    private final Role memberRole = Role.builder().id(2).roleName("MEMBER").build();

    private User manager(int id, String status) {
        return User.builder()
                .id(id)
                .email("manager" + id + "@example.com")
                .fullName("Manager " + id)
                .phone("090000000" + id)
                .role(managerRole)
                .status(status)
                .build();
    }

    @Test
    void preventsManagerFromDisablingTheirOwnAccount() {
        User actor = manager(1, "ACTIVE");
        when(users.findCenterManagersForUpdate()).thenReturn(List.of(actor));
        when(users.findByIdForUpdate(1)).thenReturn(Optional.of(actor));

        assertThrows(IllegalArgumentException.class, () -> service.updateUserStatus(1, "BLOCKED", 1));

        verify(users, never()).save(any());
    }

    @Test
    void preventsManagerFromDemotingTheirOwnRole() {
        User actor = manager(1, "ACTIVE");
        when(users.findCenterManagersForUpdate()).thenReturn(List.of(actor));
        when(users.findByIdForUpdate(1)).thenReturn(Optional.of(actor));
        when(roles.findByRoleName("MEMBER")).thenReturn(Optional.of(memberRole));

        assertThrows(IllegalArgumentException.class, () -> service.updateUserRole(1, null, "MEMBER", 1));

        verify(users, never()).save(any());
    }

    @Test
    void preventsDisablingTheLastActiveManager() {
        User target = manager(1, "ACTIVE");
        when(users.findCenterManagersForUpdate()).thenReturn(List.of(target));
        when(users.findByIdForUpdate(1)).thenReturn(Optional.of(target));

        assertThrows(IllegalArgumentException.class, () -> service.updateUserStatus(1, "INACTIVE", 2));

        verify(users, never()).save(any());
    }

    @Test
    void preventsDemotingTheLastActiveManager() {
        User target = manager(1, "ACTIVE");
        when(users.findCenterManagersForUpdate()).thenReturn(List.of(target));
        when(users.findByIdForUpdate(1)).thenReturn(Optional.of(target));
        when(roles.findByRoleName("MEMBER")).thenReturn(Optional.of(memberRole));

        assertThrows(IllegalArgumentException.class, () -> service.updateUserRole(1, null, "MEMBER", 2));

        verify(users, never()).save(any());
    }

    @Test
    void allowsDisablingAManagerWhenAnotherActiveManagerRemains() {
        User target = manager(1, "ACTIVE");
        User other = manager(2, "ACTIVE");
        when(users.findCenterManagersForUpdate()).thenReturn(List.of(target, other));
        when(users.findByIdForUpdate(1)).thenReturn(Optional.of(target));
        when(users.save(target)).thenReturn(target);

        var result = service.updateUserStatus(1, "BLOCKED", 2);

        assertEquals("BLOCKED", result.getStatus());
        verify(users).save(target);
    }
}
