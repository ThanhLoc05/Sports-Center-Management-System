package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.dto.Response.WorkoutPlanResponse;

import java.util.List;
import java.util.Optional;

public interface WorkoutPlanService {

    WorkoutPlanResponse createPlan(WorkoutPlanRequest request);

    WorkoutPlanResponse updatePlan(Integer id, WorkoutPlanRequest request);

    void deletePlan(Integer id);

    Optional<WorkoutPlanResponse> getPlanById(Integer id);

    List<WorkoutPlanResponse> getPlansByMemberId(Integer memberId);

    List<WorkoutPlanResponse> getPlansByCoachId(Integer coachId);

    List<WorkoutPlanResponse> getPlansByClassId(Integer classId);
}
