package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.RefundRequest;
import com.sportscenter.management.dto.Request.MemberRefundRequest;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PaymentInvoiceStateServiceTest {
    private final InvoiceRepository invoices = mock(InvoiceRepository.class);
    private final MemberSubscriptionRepository subscriptions = mock(MemberSubscriptionRepository.class);
    private final MembershipOrderRepository orders = mock(MembershipOrderRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final SecurityUtils security = mock(SecurityUtils.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final PaymentServiceImpl service = new PaymentServiceImpl(
            invoices,
            subscriptions,
            orders,
            mock(MembershipPackageRepository.class),
            users,
            security, mock(RefundBookings.class));

    private final RefundRequest refund = new RefundRequest("Sai gói", "CASH", "HD30 TV4", new BigDecimal("800000"), true);

    @BeforeEach
    void persistenceContext() {
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
    }

    @Test
    void genericPayEndpointRejectsInvoiceOwnedByMembershipOrder() {
        Invoice invoice = Invoice.builder()
                .id(30)
                .memberId(4)
                .membershipOrderId(20)
                .paymentStatus("PENDING")
                .build();
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));

        assertThrows(ResponseStatusException.class, () -> service.markAsPaid(30));

        assertEquals("PENDING", invoice.getPaymentStatus());
        verify(invoices, never()).save(any());
        verify(users, never()).findByIdForUpdate(anyInt());
    }

    @Test
    void memberRequestFreezesQuoteAndLeavesInvoiceAndPackagePaidUntilSettlement() {
        var today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        var order = MembershipOrder.builder().id(20).memberId(4).status("CONFIRMED")
                .createdAt(today.minusDays(2).atStartOfDay()).build();
        var invoice = Invoice.builder().id(30).memberId(4).membershipOrderId(20).subscriptionId(40)
                .amount(new BigDecimal("800000")).paymentStatus("PAID").build();
        when(security.getCurrentUserId()).thenReturn(4);
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));
        when(orders.findByIdForUpdate(20)).thenReturn(Optional.of(order));
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(invoices.findByIdForUpdate(30)).thenReturn(Optional.of(invoice));
        when(invoices.save(invoice)).thenReturn(invoice);
        var request = new MemberRefundRequest("Sai gói", new BigDecimal("720000"));
        assertThrows(ResponseStatusException.class, () -> service.requestRefund(30,
                new MemberRefundRequest("Sai gói", new BigDecimal("800000"))));
        var result = service.requestRefund(30, request);
        assertEquals("PAID", result.getPaymentStatus());
        assertNull(result.getRefundedAt());
        assertEquals("CONFIRMED", order.getStatus());
        assertEquals(90, result.getRefundRequestedPercent());
        assertEquals(request.expectedAmount(), PaymentServiceImpl.quote(invoice, order, today.plusDays(5)).amount());
        assertThrows(ResponseStatusException.class, () -> service.requestRefund(30, request));
        verify(invoices, times(1)).save(invoice);
        verifyNoInteractions(subscriptions);
    }

    @Test
    void memberCannotRequestOrReadQuoteForSomeoneElsesInvoice() {
        when(security.getCurrentUserId()).thenReturn(5);
        when(invoices.findById(30)).thenReturn(Optional.of(Invoice.builder().id(30).memberId(4).build()));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.requestRefund(30,
                new MemberRefundRequest("Sai gói", BigDecimal.TEN))).getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.quoteRefund(30)).getStatusCode().value());
        verify(invoices, never()).save(any());
    }

    @Test
    void refundSynchronizesInvoiceOrderAndSubscription() {
        Invoice invoice = Invoice.builder()
                .id(30)
                .memberId(4)
                .membershipOrderId(20)
                .subscriptionId(40)
                .amount(new BigDecimal("800000"))
                .paymentStatus("PAID")
                .build();
        MembershipOrder order = MembershipOrder.builder()
                .id(20)
                .memberId(4)
                .createdAt(java.time.LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")))
                .status("CONFIRMED")
                .build();
        MemberSubscription subscription = MemberSubscription.builder()
                .id(40)
                .memberId(4)
                .status("ACTIVE")
                .build();
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));
        when(orders.findByIdForUpdate(20)).thenReturn(Optional.of(order));
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(invoices.findByIdForUpdate(30)).thenReturn(Optional.of(invoice));
        when(subscriptions.findByIdForUpdate(40)).thenReturn(Optional.of(subscription));
        when(invoices.save(any())).thenAnswer(call -> call.getArgument(0));
        when(orders.save(any())).thenAnswer(call -> call.getArgument(0));
        when(subscriptions.save(any())).thenAnswer(call -> call.getArgument(0));

        for (String invalid : java.util.List.of("HD31 TV4", "HD30 TV5", "PC-30")) {
            var mismatch = new RefundRequest("Sai gói", "CASH", invalid, refund.expectedAmount(), true);
            assertThrows(IllegalArgumentException.class, () -> service.refundInvoice(30, mismatch));
        }
        assertEquals("PAID", invoice.getPaymentStatus());
        verify(invoices, never()).save(any());

        var result = service.refundInvoice(30, refund);

        assertEquals("REFUNDED", result.getPaymentStatus());
        assertNotNull(result.getRefundedAt());
        assertEquals("Sai gói", result.getRefundReason());
        assertEquals("CASH", result.getRefundMethod());
        assertEquals("HD30 TV4", result.getRefundReference());
        assertEquals(invoice.getAmount(), result.getAmount());
        assertEquals("REFUNDED", order.getStatus());
        assertEquals("CANCELLED", subscription.getStatus());
        var locks = inOrder(orders, users, invoices, entityManager, subscriptions);
        locks.verify(orders).findByIdForUpdate(20);
        locks.verify(users).findByIdForUpdate(4);
        locks.verify(invoices).findByIdForUpdate(30);
        locks.verify(entityManager).refresh(invoice, LockModeType.PESSIMISTIC_WRITE);
        locks.verify(subscriptions).findByIdForUpdate(40);
    }

    @Test
    void refundWindowUsesRegistrationDayAndActualInvoiceAmount() {
        var registered = java.time.LocalDate.of(2026, 11, 20);
        var order = MembershipOrder.builder().status("CONFIRMED").memberId(4)
                .createdAt(registered.atTime(23, 59)).build();
        var invoice = Invoice.builder().paymentStatus("PAID").memberId(4).subscriptionId(40)
                .amount(new BigDecimal("800000")).build();
        for (int day = 0; day <= 2; day++) {
            var quote = PaymentServiceImpl.quote(invoice, order, registered.plusDays(day));
            assertEquals(day == 0 ? 100 : 90, quote.percent());
            assertEquals(new BigDecimal(day == 0 ? "800000" : "720000"), quote.amount());
        }
        assertThrows(IllegalArgumentException.class, () -> PaymentServiceImpl.quote(invoice, order, registered.plusDays(3)));
        assertThrows(IllegalArgumentException.class, () -> PaymentServiceImpl.quote(invoice, null, registered));
    }

    @Test
    void refundingNonPaidInvoiceDoesNotChangeOrderOrSubscription() {
        Invoice invoice = Invoice.builder()
                .id(30)
                .memberId(4)
                .membershipOrderId(20)
                .paymentStatus("REFUNDED")
                .build();
        MembershipOrder order = MembershipOrder.builder()
                .id(20)
                .memberId(4)
                .status("REFUNDED")
                .build();
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));
        when(orders.findByIdForUpdate(20)).thenReturn(Optional.of(order));
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(invoices.findByIdForUpdate(30)).thenReturn(Optional.of(invoice));

        assertThrows(IllegalArgumentException.class, () -> service.refundInvoice(30, refund));

        verify(invoices, never()).save(any());
        verify(orders, never()).save(any());
        verify(subscriptions, never()).findByIdForUpdate(anyInt());
    }

    @Test
    void refundRejectsInvoiceAlreadyRefundedWhileWaitingForLock() {
        Invoice invoice = Invoice.builder().id(30).memberId(4).paymentStatus("PAID").build();
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(invoices.findByIdForUpdate(30)).thenReturn(Optional.of(invoice));
        doAnswer(call -> { invoice.setPaymentStatus("REFUNDED"); return null; })
                .when(entityManager).refresh(invoice, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(IllegalArgumentException.class, () -> service.refundInvoice(30, refund));
        verify(invoices, never()).save(any());
    }

    @Test
    void payRejectsInvoiceAlreadyPaidWhileWaitingForLock() {
        Invoice invoice = Invoice.builder().id(30).memberId(4).paymentStatus("PENDING").build();
        when(invoices.findById(30)).thenReturn(Optional.of(invoice));
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(invoices.findByIdForUpdate(30)).thenReturn(Optional.of(invoice));
        doAnswer(call -> { invoice.setPaymentStatus("PAID"); return null; })
                .when(entityManager).refresh(invoice, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(IllegalArgumentException.class, () -> service.markAsPaid(30));
        verify(invoices, never()).save(any());
    }
}
