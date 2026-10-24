package com.sportscenter.management.dto.Request;

import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberSubscriptionRequest {

    private Integer memberId;

    private Integer packageId;

    private LocalDate startDate;

    private LocalDate endDate;

    private String status;
}