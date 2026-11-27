package com.sportscenter.management.dto.Response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassResponse {

    private Integer id;

    private String className;

    private Integer sportId;

    private Integer coachId;

    private Integer roomId;

    private Integer maxCapacity;
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long bookedCount;

    private LocalDateTime scheduleTime;

    private Integer durationMinutes;

    private String requiredAccessLevel;

    private String status;

    private Integer regularClassId;

    private Integer courseId;
}
