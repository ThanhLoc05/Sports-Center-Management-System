package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;

@Getter
@Builder
public class MembershipOfferResponse {
    private Integer id;
    private String name;
    private BigDecimal price;
    private Integer durationDays;
    private String status;
    private String description;
}
