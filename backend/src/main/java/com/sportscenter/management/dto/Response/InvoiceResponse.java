package com.sportscenter.management.dto.Response;

import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceResponse {

    private Integer id;

    private Integer subscriptionId;

    private Integer membershipOrderId;

    private Integer memberId;

    private Integer receptionistId;

    private BigDecimal amount;

    private String currency;

    private String paymentMethod;

    private String paymentStatus;

    private LocalDateTime createdAt;

    private LocalDateTime paidAt;

    private LocalDateTime refundedAt;

    private LocalDateTime refundRequestedAt;
    private String refundRequestReason;
    private BigDecimal refundRequestedAmount;
    private Integer refundRequestedPercent;
    private BigDecimal refundedAmount;
    private String refundReason;
    private String refundMethod;
    private String refundReference;
    private Integer refundedBy;
}
