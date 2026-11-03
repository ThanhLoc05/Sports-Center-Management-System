package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassStudentResponse {

    private Integer memberId;

    private String fullName;

    private String email;

    private String phone;

    private String gender;

    private String fitnessGoals;

    private String bookingStatus;

    private LocalDateTime bookedAt;
}