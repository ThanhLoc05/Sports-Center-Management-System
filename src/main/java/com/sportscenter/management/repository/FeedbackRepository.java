package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Feedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, Integer> {
    List<Feedback> findByToUserId(Integer toUserId);
    List<Feedback> findByFromUserId(Integer fromUserId);
    List<Feedback> findByClassId(Integer classId);
}
