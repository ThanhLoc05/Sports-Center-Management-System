package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogResponse {

    private Integer id;
    private Integer memberId;
    private Integer coachId;
    private Integer scheduleId;
    private String feedbackFromCoach;
    private LocalDateTime createdAt;
    private List<WorkoutLogDetailResponse> details;
}
