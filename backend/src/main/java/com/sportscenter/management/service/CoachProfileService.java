package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.CoachProfileRequest;
import com.sportscenter.management.dto.Response.CoachProfileResponse;

public interface CoachProfileService {

    CoachProfileResponse getProfile(Integer coachId);

    CoachProfileResponse updateProfile(Integer coachId, CoachProfileRequest request);
}
