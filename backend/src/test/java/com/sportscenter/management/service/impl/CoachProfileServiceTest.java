package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.CoachProfileRequest;
import com.sportscenter.management.entity.CoachProfile;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.CoachProfileRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CoachProfileServiceTest {
    private final UserRepository users = mock(UserRepository.class);
    private final CoachProfileRepository profiles = mock(CoachProfileRepository.class);
    private final CoachProfileServiceImpl service = new CoachProfileServiceImpl(users, profiles);
    private final User coach = User.builder()
            .id(4)
            .fullName("HLV kiểm thử")
            .role(Role.builder().roleName("COACH").build())
            .build();

    @Test
    void publicProfileContainsProfessionalFieldsButNoContactFields() {
        when(users.findById(4)).thenReturn(Optional.of(coach));
        when(profiles.findById(4)).thenReturn(Optional.empty());

        var result = service.getProfile(4);

        assertEquals(4, result.getCoachId());
        assertEquals("HLV kiểm thử", result.getFullName());
        assertNull(result.getProfessionalLevel());
        assertNull(result.getSpecialties());
        assertNull(result.getBio());
        Set<String> fields = Arrays.stream(result.getClass().getDeclaredFields())
                .map(java.lang.reflect.Field::getName)
                .collect(Collectors.toSet());
        assertEquals(Set.of("coachId", "fullName", "professionalLevel", "specialties", "bio"), fields);
    }

    @Test
    void createsAndNormalizesProfessionalProfile() {
        var request = CoachProfileRequest.builder()
                .professionalLevel("  Nâng cao  ")
                .specialties("  Yoga, Pilates  ")
                .bio("  Hướng dẫn hội viên.  ")
                .build();
        when(users.findById(4)).thenReturn(Optional.of(coach));
        when(profiles.findById(4)).thenReturn(Optional.empty());
        when(profiles.save(any())).thenAnswer(call -> {
            CoachProfile profile = call.getArgument(0);
            assertNull(profile.getCoachId());
            assertSame(coach, profile.getUser());
            profile.setCoachId(coach.getId());
            return profile;
        });

        var result = service.updateProfile(4, request);

        assertEquals(4, result.getCoachId());
        assertEquals("Nâng cao", result.getProfessionalLevel());
        assertEquals("Yoga, Pilates", result.getSpecialties());
        assertEquals("Hướng dẫn hội viên.", result.getBio());
    }

    @Test
    void rejectsNonCoachAccounts() {
        User member = User.builder()
                .id(4)
                .role(Role.builder().roleName("MEMBER").build())
                .build();
        when(users.findById(4)).thenReturn(Optional.of(member));

        assertThrows(IllegalArgumentException.class, () -> service.getProfile(4));
        verify(profiles, never()).findById(any());
    }
}
