package com.sportscenter.management.dto.Request;

import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceRequest {

    private Integer subscriptionId;

    private Integer memberId;

    private Integer receptionistId;

    private BigDecimal amount;

    private String paymentMethod;

    private String paymentStatus;
}