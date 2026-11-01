package com.sportscenter.management.repository;

import com.sportscenter.management.entity.WorkoutLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkoutLogRepository extends JpaRepository<WorkoutLog, Integer> {
    List<WorkoutLog> findByMemberId(Integer memberId);
    List<WorkoutLog> findByCoachId(Integer coachId);
    List<WorkoutLog> findByScheduleId(Integer scheduleId);
}
