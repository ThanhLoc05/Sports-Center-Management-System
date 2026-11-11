package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberProfileRequest;
import com.sportscenter.management.entity.MemberProfile;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.MemberProfileRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDate;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class UserProfileServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final MemberProfileRepository profiles = mock(MemberProfileRepository.class);
    private final com.sportscenter.management.service.AccountActionService actions = mock(com.sportscenter.management.service.AccountActionService.class);
    private final UserServiceImpl service = new UserServiceImpl(users, mock(RoleRepository.class),
            mock(PasswordEncoder.class), profiles, actions);
    private final User user = User.builder().id(10).build();
    private final MemberProfileRequest request = MemberProfileRequest.builder()
            .dob(LocalDate.of(2000, 5, 12)).gender("Nữ")
            .address("Địa chỉ kiểm thử").fitnessGoals("Cải thiện sức bền").build();

    @Test
    void newProfileKeepsIdUnsetUntilMapsIdPersistence() {
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));
        when(profiles.findById(10)).thenReturn(Optional.empty());
        when(profiles.save(any())).thenAnswer(call -> {
            MemberProfile profile = call.getArgument(0);
            // ID null để Spring Data chọn persist; Hibernate lấy khóa từ user qua @MapsId.
            assertNull(profile.getMemberId());
            assertSame(user, profile.getUser());
            profile.setMemberId(profile.getUser().getId());
            return profile;
        });
        var result = service.updateProfile(10, request);
        assertEquals(10, result.getMemberId());
        assertEquals(request.getDob(), result.getDob());
        assertEquals(request.getGender(), result.getGender());
        assertEquals(request.getAddress(), result.getAddress());
        assertEquals(request.getFitnessGoals(), result.getFitnessGoals());
        verify(profiles, times(1)).save(any());
    }

    @Test
    void existingProfileKeepsIdentityAndUpdatesSameEntity() {
        MemberProfile existing = MemberProfile.builder().memberId(10).user(user)
                .fitnessGoals("Mục tiêu cũ").build();
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));
        when(profiles.findById(10)).thenReturn(Optional.of(existing));
        when(profiles.save(existing)).thenReturn(existing);
        var result = service.updateProfile(10, request);
        assertEquals(10, result.getMemberId());
        assertSame(user, existing.getUser());
        assertEquals(request.getDob(), existing.getDob());
        assertEquals(request.getGender(), existing.getGender());
        assertEquals(request.getAddress(), existing.getAddress());
        assertEquals(request.getFitnessGoals(), result.getFitnessGoals());
        verify(profiles).save(same(existing));
    }

    @Test
    void missingAccountDoesNotCreateProfile() {
        when(users.findByIdForUpdate(10)).thenReturn(Optional.empty());
        assertThrows(IllegalArgumentException.class, () -> service.updateProfile(10, request));
        verify(profiles, never()).save(any());
    }

    @Test
    void updatesMemberAccountDetailsAndProfileTogether() {
        User account = User.builder().id(10).email("old@example.com").fullName("Member")
                .phone("0900000010").role(Role.builder().roleName("MEMBER").build()).build();
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(account));
        when(profiles.findById(10)).thenReturn(Optional.empty());
        when(profiles.save(any())).thenAnswer(call -> {
            MemberProfile profile = call.getArgument(0);
            profile.setMemberId(10);
            return profile;
        });
        var update = MemberProfileRequest.builder().fullName("New Member")
                .email("NEW@example.com").phone("+84900000010")
                .fitnessGoals("Build endurance").build();

        var result = service.updateProfile(10, update);

        assertEquals("New Member", account.getFullName());
        assertEquals("old@example.com", account.getEmail());
        assertEquals("new@example.com", account.getPendingEmail());
        assertEquals("+84900000010", account.getPhone());
        assertEquals("old@example.com", result.getEmail());
        assertEquals("new@example.com", result.getPendingEmail());
        verify(users).save(account);
        verify(actions).sendPendingEmailVerification(account, "new@example.com");
        verify(profiles).save(any());
    }

    @Test
    void rejectsEmailAlreadyUsedByAnotherAccountWithoutSavingProfile() {
        User account = User.builder().id(10).email("old@example.com").fullName("Member")
                .phone("0900000010").build();
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(account));
        when(users.existsByEmailIgnoreCaseAndIdNot("taken@example.com", 10)).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> service.updateProfile(10,
                MemberProfileRequest.builder().email("taken@example.com").build()));

        verify(users, never()).save(any());
        verify(profiles, never()).save(any());
    }

    @Test
    void rejectsPhoneAlreadyUsedByAnotherAccountWithoutSavingProfile() {
        User account = User.builder().id(10).email("member@example.com").fullName("Member")
                .phone("0900000010").build();
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(account));
        when(users.existsByPhoneAndIdNot("0900000011", 10)).thenReturn(true);

        assertThrows(IllegalArgumentException.class, () -> service.updateProfile(10,
                MemberProfileRequest.builder().phone("0900000011").build()));

        verify(users, never()).save(any());
        verify(profiles, never()).save(any());
    }
}
