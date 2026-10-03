package com.sportscenter.management.dto.Request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttendanceRequest {

    private Integer classId;

    private Integer memberId;

    private Integer checkedInBy;

    private String status;
}