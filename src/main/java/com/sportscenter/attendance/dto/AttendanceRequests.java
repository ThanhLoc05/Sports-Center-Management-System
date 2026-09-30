package com.sportscenter.attendance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

public final class AttendanceRequests {
    private AttendanceRequests() { }

    public record AttendanceRequest(
            @Positive long memberId,
            @Positive long scheduleId,
            @NotBlank String status) { }

    public record CheckInRequest(@Positive long memberId) { }
}
