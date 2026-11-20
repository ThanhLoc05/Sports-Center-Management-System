package com.sportscenter.management.dto.Request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogRequest {

    @NotNull(message = "ID học viên không được để trống")
    private Integer memberId;

    private Integer coachId;

    private Integer scheduleId;

    private String feedbackFromCoach;

    @NotEmpty(message = "Nhật ký phải có ít nhất một bài tập")
    private List<@Valid @NotNull(message = "Thông tin bài tập không được để trống") WorkoutLogDetailRequest> details;
}
