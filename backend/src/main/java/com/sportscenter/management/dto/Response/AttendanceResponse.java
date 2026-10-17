package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttendanceResponse {

    private Integer id;

    private Integer classId;

    private Integer memberId;

    private Integer checkedInBy;

    private LocalDateTime checkedInAt;

    private String status;
}