package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutPlanRequest {

    @NotBlank(message = "Tiêu đề kế hoạch không được để trống")
    private String title;

    private Integer coachId;

    private Integer memberId;

    private Integer classId;

    @NotBlank(message = "Mô tả bài tập / giáo án không được để trống")
    private String description;
}
