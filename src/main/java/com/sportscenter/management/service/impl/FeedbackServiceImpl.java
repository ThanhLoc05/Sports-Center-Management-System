package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.FeedbackRequest;
import com.sportscenter.management.dto.Response.FeedbackResponse;
import com.sportscenter.management.entity.Feedback;
import com.sportscenter.management.repository.FeedbackRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.FeedbackService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class FeedbackServiceImpl implements FeedbackService {

    private final FeedbackRepository feedbackRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

    @Override
    public FeedbackResponse createFeedback(FeedbackRequest request) {
        if (request == null || request.getComment() == null || request.getComment().isBlank()) {
            throw new IllegalArgumentException("Nội dung nhận xét/đánh giá không được để trống");
        }

        Integer fromUserId = request.getFromUserId() != null
                ? request.getFromUserId()
                : securityUtils.getCurrentUserId();

        if (fromUserId == null || !userRepository.existsById(fromUserId)) {
            throw new IllegalArgumentException("Người gửi đánh giá không hợp lệ");
        }

        if (request.getToUserId() != null && !userRepository.existsById(request.getToUserId())) {
            throw new IllegalArgumentException("Người nhận đánh giá không tồn tại");
        }

        String type = request.getType();
        if (type == null || type.isBlank()) {
            if (request.getClassId() != null) {
                type = "CLASS_FEEDBACK";
            } else if (securityUtils.isCoach()) {
                type = "COACH_TO_MEMBER";
            } else {
                type = "MEMBER_TO_COACH";
            }
        }

        Feedback feedback = Feedback.builder()
                .fromUserId(fromUserId)
                .toUserId(request.getToUserId())
                .classId(request.getClassId())
                .rating(request.getRating())
                .comment(request.getComment())
                .type(type)
                .createdAt(LocalDateTime.now())
                .build();

        Feedback saved = feedbackRepository.save(feedback);
        return mapToResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeedbackResponse> getFeedbacksForCoach(Integer coachId) {
        return feedbackRepository.findByToUserId(coachId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeedbackResponse> getFeedbacksForMember(Integer memberId) {
        return feedbackRepository.findByToUserId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeedbackResponse> getFeedbacksForClass(Integer classId) {
        return feedbackRepository.findByClassId(classId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Double getAverageRatingForCoach(Integer coachId) {
        List<Feedback> feedbacks = feedbackRepository.findByToUserId(coachId);
        return feedbacks.stream()
                .filter(f -> f.getRating() != null && f.getRating() > 0)
                .mapToInt(Feedback::getRating)
                .average()
                .orElse(0.0);
    }

    private FeedbackResponse mapToResponse(Feedback feedback) {
        return FeedbackResponse.builder()
                .id(feedback.getId())
                .fromUserId(feedback.getFromUserId())
                .toUserId(feedback.getToUserId())
                .classId(feedback.getClassId())
                .rating(feedback.getRating())
                .comment(feedback.getComment())
                .type(feedback.getType())
                .createdAt(feedback.getCreatedAt())
                .build();
    }
}
