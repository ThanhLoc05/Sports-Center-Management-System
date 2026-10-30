package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberProfileRequest;
import com.sportscenter.management.entity.MemberProfile;
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
    private final UserServiceImpl service = new UserServiceImpl(users, mock(RoleRepository.class),
            mock(PasswordEncoder.class), profiles);
    private final User user = User.builder().id(10).build();
    private final MemberProfileRequest request = MemberProfileRequest.builder()
            .dob(LocalDate.of(2000, 5, 12)).gender("Nữ")
            .address("Địa chỉ kiểm thử").fitnessGoals("Cải thiện sức bền").build();

    @Test
    void newProfileKeepsIdUnsetUntilMapsIdPersistence() {
        when(users.findById(10)).thenReturn(Optional.of(user));
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
        when(users.findById(10)).thenReturn(Optional.of(user));
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
        when(users.findById(10)).thenReturn(Optional.empty());
        assertThrows(IllegalArgumentException.class, () -> service.updateProfile(10, request));
        verify(profiles, never()).save(any());
    }
}
