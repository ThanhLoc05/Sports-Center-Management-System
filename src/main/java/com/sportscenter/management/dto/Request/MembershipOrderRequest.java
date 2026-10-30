package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class MembershipOrderRequest {
    @NotNull @Positive
    private Integer memberId;
    @NotNull @Positive
    private Integer packageId;
    @Positive
    private Integer sourceSubscriptionId;
    @NotNull @Pattern(regexp = "CASH|BANK_TRANSFER")
    private String paymentMethod;
}
