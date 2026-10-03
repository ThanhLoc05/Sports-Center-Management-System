package com.sportscenter.management.dto.Request;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MembershipPackageRequest {

    private String packageName;

    private Integer durationDays;

    private BigDecimal price;

    private String description;

    private String status;
}