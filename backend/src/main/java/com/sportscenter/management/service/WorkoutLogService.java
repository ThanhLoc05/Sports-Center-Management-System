package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.WorkoutLogRequest;
import com.sportscenter.management.dto.Response.WorkoutLogResponse;

import java.util.List;
import java.util.Optional;

public interface WorkoutLogService {

    WorkoutLogResponse createLog(WorkoutLogRequest request);

    WorkoutLogResponse updateFeedback(Integer logId, String feedback);

    List<WorkoutLogResponse> getLogsByMemberId(Integer memberId);

    List<WorkoutLogResponse> getLogsByCoachId(Integer coachId);

    Optional<WorkoutLogResponse> getLogById(Integer id);
}
