package com.sportscenter.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record MemberRegistration(
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotBlank @Size(max = 100) String fullName,
        @Size(max = 20) String phone,
        LocalDate dateOfBirth,
        @Size(max = 10) String gender,
        @Size(max = 500) String address,
        String fitnessGoal,
        @Size(max = 20) String emergencyContact) {
}
