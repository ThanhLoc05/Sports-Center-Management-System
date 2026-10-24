package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.FeedbackRequest;
import com.sportscenter.management.dto.Response.FeedbackResponse;

import java.util.List;

public interface FeedbackService {

    FeedbackResponse createFeedback(FeedbackRequest request);

    List<FeedbackResponse> getFeedbacksForCoach(Integer coachId);

    List<FeedbackResponse> getFeedbacksForMember(Integer memberId);

    List<FeedbackResponse> getFeedbacksForClass(Integer classId);

    Double getAverageRatingForCoach(Integer coachId);
}
