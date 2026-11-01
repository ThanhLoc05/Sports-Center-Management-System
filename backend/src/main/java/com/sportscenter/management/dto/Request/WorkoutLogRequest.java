package com.sportscenter.management.dto.Request;

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

    private List<WorkoutLogDetailRequest> details;
}
