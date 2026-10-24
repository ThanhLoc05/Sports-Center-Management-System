package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogDetailRequest {

    @NotBlank(message = "Tên bài tập không được để trống")
    private String exerciseName;

    private Integer sets;
    private Integer reps;
    private BigDecimal weightKg;
}
