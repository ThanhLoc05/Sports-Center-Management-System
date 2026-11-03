package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberSubscriptionResponse {

    private Integer id;

    private Integer memberId;

    private Integer packageId;

    private LocalDate startDate;

    private LocalDate endDate;

    private String status;
}