package com.sportscenter.classes.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public final class ClassRequests {
    private ClassRequests() { }

    public record ClassRequest(
            @NotBlank @Size(max = 100) String name,
            @Size(max = 1000) String description,
            @Positive int maxCapacity) { }

    public record RoomRequest(
            @NotBlank @Size(max = 50) String name,
            @Positive int capacity,
            @Size(max = 500) String description) { }

    public record ScheduleRequest(
            @Positive long classId,
            @Positive long coachId,
            @Positive long roomId,
            @NotNull LocalDateTime startTime,
            @NotNull LocalDateTime endTime) { }
}
