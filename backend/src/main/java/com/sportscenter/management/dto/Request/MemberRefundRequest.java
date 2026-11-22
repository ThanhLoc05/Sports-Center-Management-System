package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;

public record MemberRefundRequest(@NotBlank @Size(max = 500) String reason,
                                  @NotNull @Positive BigDecimal expectedAmount) {}
