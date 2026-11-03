package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutPlanResponse {

    private Integer id;
    private String title;
    private Integer coachId;
    private Integer memberId;
    private Integer classId;
    private String description;
    private LocalDateTime createdAt;
}
