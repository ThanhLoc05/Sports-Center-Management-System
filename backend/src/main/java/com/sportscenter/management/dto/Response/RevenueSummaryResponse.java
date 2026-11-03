package com.sportscenter.management.dto.Response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RevenueSummaryResponse {
    private LocalDateTime startDate;
    private LocalDateTime endDate;
    private BigDecimal totalGrossRevenue; // Tổng thu (PAID)
    private BigDecimal totalRefunded;     // Tổng hoàn (REFUNDED)
    private BigDecimal netRevenue;        // Doanh thu ròng (Gross - Refunded)
    private long totalPaidInvoices;
    private long totalRefundedInvoices;
    private Map<String, BigDecimal> revenueByMethod;
}
