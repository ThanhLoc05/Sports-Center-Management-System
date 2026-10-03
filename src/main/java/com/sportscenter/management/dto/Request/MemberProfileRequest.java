package com.sportscenter.management.dto.Request;

import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberProfileRequest {

    private Integer memberId;

    private LocalDate dob;

    private String gender;

    private String address;

    private String fitnessGoals;
}