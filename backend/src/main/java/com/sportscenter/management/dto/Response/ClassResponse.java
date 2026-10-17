package com.sportscenter.management.dto.Response;

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

    private LocalDateTime scheduleTime;

    private Integer durationMinutes;

    private String status;
}