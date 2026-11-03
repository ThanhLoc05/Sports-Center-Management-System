package com.sportscenter.management.dto.Response;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MembershipPackageResponse {

    private Integer id;

    private String packageName;

    private Integer durationDays;

    private BigDecimal price;

    private String accessLevel;

    private String description;

    private String status;
}
