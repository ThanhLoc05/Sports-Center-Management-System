package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class PaymentRevenueServiceTest {

    private final InvoiceRepository invoices = mock(InvoiceRepository.class);
    private final MembershipOrderRepository orders = mock(MembershipOrderRepository.class);
    private final PaymentServiceImpl service = new PaymentServiceImpl(
            invoices,
            mock(MemberSubscriptionRepository.class),
            orders,
            mock(MembershipPackageRepository.class),
            mock(UserRepository.class),
            mock(SecurityUtils.class));
    private final LocalDateTime start = LocalDateTime.of(2026, 10, 1, 0, 0);
    private final LocalDateTime end = LocalDateTime.of(2026, 10, 31, 23, 59);

    @Test
    void netRevenueSubtractsRefundsFromCollectionsInTheirOwnPeriods() {
        when(invoices.calculateTotalRevenue(start, end)).thenReturn(new BigDecimal("500000"));
        when(invoices.calculateTotalRefunded(start, end)).thenReturn(new BigDecimal("200000"));

        assertEquals(new BigDecimal("300000"), service.calculateTotalRevenue(start, end));
    }

    @Test
    void summaryCountsRefundedInvoicesAsCollectionsOnPaidDateAndRefundsOnRefundDate() {
        Invoice cash = Invoice.builder()
                .id(1)
                .amount(new BigDecimal("600000"))
                .paymentMethod("CASH")
                .paymentStatus("PAID")
                .build();
        Invoice refundedTransfer = Invoice.builder()
                .id(2)
                .amount(new BigDecimal("400000"))
                .paymentMethod("BANK_TRANSFER")
                .paymentStatus("REFUNDED")
                .build();
        when(invoices.calculateTotalRevenue(start, end)).thenReturn(new BigDecimal("1000000"));
        when(invoices.calculateTotalRefunded(start, end)).thenReturn(new BigDecimal("400000"));
        when(invoices.countCollectedInvoices(start, end)).thenReturn(2L);
        when(invoices.countRefundedInvoices(start, end)).thenReturn(1L);
        when(invoices.findCollectedInvoicesBetween(start, end)).thenReturn(List.of(cash, refundedTransfer));

        var result = service.getRevenueSummary(start, end);

        assertEquals(new BigDecimal("1000000"), result.getTotalGrossRevenue());
        assertEquals(new BigDecimal("400000"), result.getTotalRefunded());
        assertEquals(new BigDecimal("600000"), result.getNetRevenue());
        assertEquals(2, result.getTotalPaidInvoices());
        assertEquals(1, result.getTotalRefundedInvoices());
        assertEquals(new BigDecimal("600000"), result.getRevenueByMethod().get("CASH"));
        assertEquals(new BigDecimal("400000"), result.getRevenueByMethod().get("BANK_TRANSFER"));
        verify(invoices).countCollectedInvoices(start, end);
        verify(invoices).findCollectedInvoicesBetween(start, end);
    }
}
