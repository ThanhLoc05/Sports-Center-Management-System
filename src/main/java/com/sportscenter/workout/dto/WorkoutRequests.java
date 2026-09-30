package com.sportscenter.workout.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;

public final class WorkoutRequests {
    private WorkoutRequests() { }

    public record WorkoutPlanRequest(
            @NotBlank @Size(max = 150) String title,
            @Positive Long memberId,
            @Positive Long classId,
            @NotBlank String description) { }

    public record WorkoutLogRequest(
            @Positive long memberId,
            @Positive Long scheduleId,
            String feedback,
            @NotNull @NotEmpty List<@Valid ExerciseRequest> exercises) { }

    public record ExerciseRequest(
            @NotBlank @Size(max = 150) String name,
            @Positive Integer sets,
            @Positive Integer reps,
            @PositiveOrZero BigDecimal weightKg) { }
}
