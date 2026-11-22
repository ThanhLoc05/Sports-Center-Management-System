package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.Invoice;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** [FLOW 3] Doanh thu từng ngày: thu theo ngày thanh toán, hoàn theo ngày hoàn, cộng lại khớp số tổng. */
class PaymentDailyRevenueTest {

    @Test
    void groupsCollectedByPaidDayAndRefundsByRefundDay() {
        Invoice cash = Invoice.builder().id(1).amount(new BigDecimal("800000"))
                .paymentStatus("PAID").paidAt(LocalDateTime.of(2026, 11, 20, 9, 0)).build();
        Invoice refundedLater = Invoice.builder().id(2).amount(new BigDecimal("800000"))
                .paymentStatus("REFUNDED").paidAt(LocalDateTime.of(2026, 11, 20, 10, 0))
                .refundedAt(LocalDateTime.of(2026, 11, 21, 8, 0)).refundedAmount(new BigDecimal("720000")).build();

        var points = PaymentServiceImpl.dailyRevenue(List.of(cash, refundedLater), List.of(refundedLater),
                LocalDate.of(2026, 11, 19), LocalDate.of(2026, 11, 21));

        assertEquals(3, points.size());
        assertEquals(0, points.get(0).getNet().signum());
        assertEquals(0, new BigDecimal("1600000").compareTo(points.get(1).getGross()));
        assertEquals(0, new BigDecimal("720000").compareTo(points.get(2).getRefunded()));
        assertEquals(0, new BigDecimal("-720000").compareTo(points.get(2).getNet()));
        BigDecimal net = points.stream().map(p -> p.getNet()).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertEquals(0, new BigDecimal("880000").compareTo(net));
    }

    @Test
    void skipsDailyPointsForTooLongRange() {
        assertTrue(PaymentServiceImpl.dailyRevenue(List.of(), List.of(),
                LocalDate.of(2020, 1, 1), LocalDate.of(2026, 1, 1)).isEmpty());
    }
}
