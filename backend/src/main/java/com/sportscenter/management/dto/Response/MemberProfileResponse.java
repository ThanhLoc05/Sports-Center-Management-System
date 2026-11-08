package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberProfileResponse {

    private Integer memberId;

    private String fullName;

    private String email;

    private String phone;

    private LocalDate dob;

    private String gender;

    private String address;

    private String fitnessGoals;
}