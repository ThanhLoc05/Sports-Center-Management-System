package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CoachProfileRequest {

    @Size(max = 100)
    private String professionalLevel;

    @Size(max = 500)
    private String specialties;

    @Size(max = 4000)
    private String bio;
}
