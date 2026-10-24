package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.FeedbackRequest;
import com.sportscenter.management.dto.Response.FeedbackResponse;
import com.sportscenter.management.service.FeedbackService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ============================================================================
 * CONTROLLER ĐÁNH GIÁ & NHẬN XÉT (FEEDBACK / REVIEW CONTROLLER)
 * ============================================================================
 * - Học viên chấm sao & đánh giá HLV, Lớp học.
 * - HLV nhận xét, đánh giá học viên.
 * - Tra cứu điểm đánh giá trung bình của HLV.
 */
@RestController
@RequestMapping("/api/v1/feedbacks")
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<FeedbackResponse> createFeedback(@Valid @RequestBody FeedbackRequest request) {
        return ResponseEntity.status(201).body(feedbackService.createFeedback(request));
    }

    @GetMapping("/coach/{coachId}")
    public ResponseEntity<Map<String, Object>> getFeedbacksForCoach(@PathVariable Integer coachId) {
        List<FeedbackResponse> list = feedbackService.getFeedbacksForCoach(coachId);
        Double avg = feedbackService.getAverageRatingForCoach(coachId);

        Map<String, Object> result = new HashMap<>();
        result.put("coachId", coachId);
        result.put("averageRating", avg);
        result.put("totalReviews", list.size());
        result.put("feedbacks", list);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<FeedbackResponse>> getFeedbacksForMember(@PathVariable Integer memberId) {
        return ResponseEntity.ok(feedbackService.getFeedbacksForMember(memberId));
    }

    @GetMapping("/class/{classId}")
    public ResponseEntity<List<FeedbackResponse>> getFeedbacksForClass(@PathVariable Integer classId) {
        return ResponseEntity.ok(feedbackService.getFeedbacksForClass(classId));
    }
}
