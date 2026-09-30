package com.sportscenter.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public final class UserRequests {
    private UserRequests() { }

    public record StaffRegistration(
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 8, max = 72) String password,
            @NotBlank @Size(max = 100) String fullName,
            @Size(max = 20) String phone,
            @NotBlank String role) { }

    public record UserStatusRequest(@NotBlank String status) { }

    public record MemberProfileRequest(
            LocalDate dateOfBirth,
            @Size(max = 10) String gender,
            @Size(max = 500) String address,
            String fitnessGoal,
            @Size(max = 20) String emergencyContact) { }
}
