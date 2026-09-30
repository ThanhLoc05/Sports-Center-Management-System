package com.sportscenter.membership.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public final class MembershipRequests {
    private MembershipRequests() { }

    public record MembershipRequest(
            @NotBlank @Size(max = 100) String name,
            @Positive int durationDays,
            @NotNull @DecimalMin("0.00") BigDecimal price,
            @Size(max = 1000) String description) { }

    public record SubscriptionRequest(
            @Positive Long memberId,
            @Positive long membershipId,
            @NotBlank String paymentMethod) { }
}
