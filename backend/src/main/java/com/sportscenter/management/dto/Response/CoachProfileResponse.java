package com.sportscenter.management.dto.Response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CoachProfileResponse {

    private Integer coachId;
    private String fullName;
    private String professionalLevel;
    private String specialties;
    private String bio;
}
