package com.sportscenter.management.dto.Response;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogDetailResponse {

    private Integer id;
    private String exerciseName;
    private Integer sets;
    private Integer reps;
    private BigDecimal weightKg;
}
