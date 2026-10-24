package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeedbackRequest {

    private Integer fromUserId;

    private Integer toUserId;

    private Integer classId;

    @Min(value = 1, message = "Đánh giá tối thiểu 1 sao")
    @Max(value = 5, message = "Đánh giá tối đa 5 sao")
    private Integer rating;

    @NotBlank(message = "Nội dung nhận xét/đánh giá không được để trống")
    private String comment;

    private String type; // MEMBER_TO_COACH, COACH_TO_MEMBER, CLASS_FEEDBACK
}
