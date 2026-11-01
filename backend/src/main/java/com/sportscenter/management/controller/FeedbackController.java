package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
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
    private final SecurityUtils securityUtils;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<FeedbackResponse> createFeedback(@Valid @RequestBody FeedbackRequest request) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        // Lấy người gửi và loại nhận xét từ tài khoản/ vai trò đăng nhập, không tin dữ liệu client tự gửi.
        request.setFromUserId(currentUserId);
        if (securityUtils.hasRole("MEMBER")) {
            request.setType(request.getClassId() == null ? "MEMBER_TO_COACH" : "CLASS_FEEDBACK");
        } else if (securityUtils.isCoach()) {
            request.setType("COACH_TO_MEMBER");
        } else {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.status(201).body(feedbackService.createFeedback(request));
    }

    @GetMapping("/coach/{coachId}")
    @PreAuthorize("isAuthenticated()")
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
        if (!securityUtils.isOwnerOrAuthorized(memberId)) return ResponseEntity.status(403).build();
        return ResponseEntity.ok(feedbackService.getFeedbacksForMember(memberId));
    }

    @GetMapping("/class/{classId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<FeedbackResponse>> getFeedbacksForClass(@PathVariable Integer classId) {
        return ResponseEntity.ok(feedbackService.getFeedbacksForClass(classId));
    }
}
