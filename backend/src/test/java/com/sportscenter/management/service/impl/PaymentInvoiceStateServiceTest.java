package com.sportscenter.management.service.impl;

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
    private final EntityManager entityManager = mock(EntityManager.class);
    private final PaymentServiceImpl service = new PaymentServiceImpl(
            invoices,
            subscriptions,
            orders,
            mock(MembershipPackageRepository.class),
            users,
            mock(SecurityUtils.class));

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

        var result = service.refundInvoice(30);

        assertEquals("REFUNDED", result.getPaymentStatus());
        assertNotNull(result.getRefundedAt());
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

        assertThrows(IllegalArgumentException.class, () -> service.refundInvoice(30));

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
        assertThrows(IllegalArgumentException.class, () -> service.refundInvoice(30));
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
