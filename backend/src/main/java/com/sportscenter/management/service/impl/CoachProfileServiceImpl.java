package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.CoachProfileRequest;
import com.sportscenter.management.dto.Response.CoachProfileResponse;
import com.sportscenter.management.entity.CoachProfile;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.CoachProfileRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.CoachProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class CoachProfileServiceImpl implements CoachProfileService {

    private final UserRepository userRepository;
    private final CoachProfileRepository profileRepository;

    @Override
    @Transactional(readOnly = true)
    public List<CoachProfileResponse> getActiveProfiles() {
        return userRepository.findByRole_RoleNameAndStatus("COACH", "ACTIVE").stream()
                .map(coach -> profileRepository.findById(coach.getId())
                        .map(profile -> toResponse(coach, profile))
                        .orElseGet(() -> toResponse(coach, null)))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public CoachProfileResponse getProfile(Integer coachId) {
        User coach = findCoach(coachId);
        return profileRepository.findById(coachId)
                .map(profile -> toResponse(coach, profile))
                .orElseGet(() -> toResponse(coach, null));
    }

    @Override
    public CoachProfileResponse updateProfile(Integer coachId, CoachProfileRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin hồ sơ HLV không được để trống");
        }
        User coach = findCoach(coachId);
        CoachProfile profile = profileRepository.findById(coachId)
                .orElseGet(() -> CoachProfile.builder().user(coach).build());
        profile.setUser(coach);
        profile.setProfessionalLevel(clean(request.getProfessionalLevel()));
        profile.setSpecialties(clean(request.getSpecialties()));
        profile.setBio(clean(request.getBio()));
        return toResponse(coach, profileRepository.save(profile));
    }

    private User findCoach(Integer coachId) {
        User user = userRepository.findById(coachId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy tài khoản HLV"));
        if (user.getRole() == null || !"COACH".equals(user.getRole().getRoleName())) {
            throw new IllegalArgumentException("Tài khoản này không phải HLV");
        }
        return user;
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private CoachProfileResponse toResponse(User coach, CoachProfile profile) {
        return CoachProfileResponse.builder()
                .coachId(coach.getId())
                .fullName(coach.getFullName())
                .professionalLevel(profile == null ? null : profile.getProfessionalLevel())
                .specialties(profile == null ? null : profile.getSpecialties())
                .bio(profile == null ? null : profile.getBio())
                .build();
    }
}
