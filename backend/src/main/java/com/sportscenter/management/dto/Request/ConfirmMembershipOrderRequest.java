package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class ConfirmMembershipOrderRequest {
    @NotNull @PositiveOrZero
    private Integer version;
    @Size(max = 100)
    private String bankTransactionId;
}
