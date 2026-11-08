package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.CoachProfileRequest;
import com.sportscenter.management.dto.Response.CoachProfileResponse;

import java.util.List;

public interface CoachProfileService {

    List<CoachProfileResponse> getActiveProfiles();

    CoachProfileResponse getProfile(Integer coachId);

    CoachProfileResponse updateProfile(Integer coachId, CoachProfileRequest request);
}
