package com.sportscenter.management.repository;

import com.sportscenter.management.entity.WorkoutPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkoutPlanRepository extends JpaRepository<WorkoutPlan, Integer> {
    List<WorkoutPlan> findByMemberId(Integer memberId);
    List<WorkoutPlan> findByCoachId(Integer coachId);
    List<WorkoutPlan> findByClassId(Integer classId);
}
