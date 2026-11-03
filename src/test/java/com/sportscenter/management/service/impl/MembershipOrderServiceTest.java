package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.ConfirmMembershipOrderRequest;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

class MembershipOrderServiceTest {
    private final MembershipOrderRepository orders = mock(MembershipOrderRepository.class);
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final MemberSubscriptionRepository subscriptions = mock(MemberSubscriptionRepository.class);
    private final InvoiceRepository invoices = mock(InvoiceRepository.class);
    private final SecurityUtils security = mock(SecurityUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final Map<Integer, MembershipOrder> savedOrders = new HashMap<>();
    private final Map<Integer, Invoice> savedInvoices = new HashMap<>();
    private final List<MemberSubscription> periods = new ArrayList<>();
    private MembershipOrderService service;
    private MembershipServiceImpl memberships;
    private MemberSubscription source;

    @BeforeEach
    void setUp() {
        service = new MembershipOrderService(orders, packages, subscriptions, invoices,
                users, security);
        memberships = new MembershipServiceImpl(subscriptions, packages, users, invoices);
        ReflectionTestUtils.setField(service, "entityManager", entityManager);
        ReflectionTestUtils.setField(memberships, "entityManager", entityManager);
        source = MemberSubscription.builder().id(10).memberId(4).packageId(1)
                .startDate(LocalDate.now().minusDays(10)).endDate(LocalDate.now().plusDays(10))
                .status("ACTIVE").build();
        periods.add(source);
        when(security.getCurrentUserId()).thenReturn(3);
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).build()));
        when(orders.findByIdForUpdate(anyInt())).thenAnswer(call -> Optional.ofNullable(savedOrders.get(call.getArgument(0))));
        when(orders.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(invoices.findByMembershipOrderId(anyInt())).thenAnswer(call -> Optional.ofNullable(savedInvoices.get(call.getArgument(0))));
        when(subscriptions.findById(anyInt())).thenAnswer(call -> periods.stream()
                .filter(s -> s.getId().equals(call.getArgument(0))).findFirst());
        when(subscriptions.findMemberIdById(anyInt())).thenAnswer(call -> periods.stream()
                .filter(s -> s.getId().equals(call.getArgument(0))).map(MemberSubscription::getMemberId).findFirst());
        when(subscriptions.save(any())).thenAnswer(call -> call.getArgument(0));
        when(subscriptions.findByMemberId(4)).thenAnswer(call -> new ArrayList<>(periods));
        when(subscriptions.findLastActiveEndDate(4)).thenAnswer(call -> periods.stream()
                .filter(s -> "ACTIVE".equals(s.getStatus()) && !s.getStartDate().isAfter(s.getEndDate()))
                .map(MemberSubscription::getEndDate).max(LocalDate::compareTo));
        when(subscriptions.saveAndFlush(any())).thenAnswer(call -> {
            MemberSubscription period = call.getArgument(0);
            period.setId(10 + periods.size());
            periods.add(period);
            return period;
        });
    }

    private void pendingOrder(int id) {
        savedOrders.put(id, MembershipOrder.builder().id(id).memberId(4).packageId(1)
                .kind("RENEWAL").sourceSubscriptionId(10).sourcePackageId(1)
                .packageName("Test package").packagePrice(new BigDecimal("800000"))
                .packageDurationDays(30).packageStatus("ACTIVE").paymentMethod("CASH")
                .status("PENDING_PAYMENT").version(0).build());
        savedInvoices.put(id, Invoice.builder().id(id + 100).membershipOrderId(id)
                .memberId(4).amount(new BigDecimal("800000")).currency("VND")
                .paymentMethod("CASH").paymentStatus("PENDING").build());
    }

    private void confirm(int id) {
        ConfirmMembershipOrderRequest request = new ConfirmMembershipOrderRequest();
        request.setVersion(0);
        service.confirm(id, request, "confirm-" + id);
    }

    @Test
    void firstRenewalStartsAfterSourceAndDoesNotExistWhilePending() {
        pendingOrder(20);
        assertEquals(1, periods.size());
        assertEquals("PENDING", savedInvoices.get(20).getPaymentStatus());
        confirm(20);
        assertEquals(source.getEndDate().plusDays(1), periods.get(1).getStartDate());
        assertEquals(periods.get(1).getStartDate().plusDays(29), periods.get(1).getEndDate());
        assertEquals("PAID", savedInvoices.get(20).getPaymentStatus());
    }

    @Test
    void secondPaidRenewalFromSameSourceMustFollowLastPaidPeriod() {
        pendingOrder(20);
        confirm(20);
        // Chỉ tạo đơn kế tiếp sau khi đơn trước đã xác nhận, không giả lập hai đơn chờ cùng lúc.
        pendingOrder(21);
        confirm(21);
        assertEquals(periods.get(1).getEndDate().plusDays(1), periods.get(2).getStartDate());
    }

    @Test
    void cancelledSourceWhilePendingMustRejectConfirmationBeforeCreatingPeriod() {
        pendingOrder(20);
        memberships.cancelSubscription(10);
        assertThrows(ResponseStatusException.class, () -> confirm(20));
        verify(subscriptions, never()).saveAndFlush(any());
        assertEquals("PENDING", savedInvoices.get(20).getPaymentStatus());
    }

    @Test
    void confirmBeforeCancelKeepsPaidRenewalAndCancelsOnlySource() {
        pendingOrder(20);
        confirm(20);
        assertEquals("CANCELLED", memberships.cancelSubscription(10).getStatus());
        assertEquals("ACTIVE", periods.get(1).getStatus());
        assertEquals("CONFIRMED", savedOrders.get(20).getStatus());
        assertEquals("PAID", savedInvoices.get(20).getPaymentStatus());
    }

    @Test
    void cancellingAlreadyCancelledSourceIsRejected() {
        memberships.cancelSubscription(10);
        assertThrows(IllegalArgumentException.class, () -> memberships.cancelSubscription(10));
        verify(subscriptions, times(1)).save(any());
    }

    @Test
    void cancellingUnknownSubscriptionDoesNotLockOrSave() {
        assertThrows(IllegalArgumentException.class, () -> memberships.cancelSubscription(999));
        verify(users, never()).findByIdForUpdate(anyInt());
        verify(subscriptions, never()).save(any());
    }

    @Test
    void cancelRefreshesCachedSourceOnlyAfterMemberLock() {
        doAnswer(call -> { source.setStatus("CANCELLED"); return null; })
                .when(entityManager).refresh(source, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(IllegalArgumentException.class, () -> memberships.cancelSubscription(10));
        var sequence = inOrder(subscriptions, users, entityManager);
        sequence.verify(subscriptions).findMemberIdById(10);
        sequence.verify(users).findByIdForUpdate(4);
        sequence.verify(subscriptions).findById(10);
        sequence.verify(entityManager).refresh(source, LockModeType.PESSIMISTIC_WRITE);
        verify(subscriptions, never()).save(any());
    }

    @Test
    void confirmRejectsCancellationDiscoveredByRefresh() {
        pendingOrder(20);
        doAnswer(call -> { source.setStatus("CANCELLED"); return null; })
                .when(entityManager).refresh(source, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(ResponseStatusException.class, () -> confirm(20));
        var sequence = inOrder(users, entityManager);
        sequence.verify(users).findByIdForUpdate(4);
        sequence.verify(entityManager).refresh(source, LockModeType.PESSIMISTIC_WRITE);
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    void pendingSubscriptionStillCanBeCancelledButExpiredCannot() {
        source.setStatus("EXPIRED");
        assertThrows(IllegalArgumentException.class, () -> memberships.cancelSubscription(10));
        source.setStatus("PENDING_PAYMENT");
        assertEquals("CANCELLED", memberships.cancelSubscription(10).getStatus());
    }

    @Test
    void cancellationPersistenceFailureRollsBackTransaction() {
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        TransactionStatus transaction = mock(TransactionStatus.class);
        when(manager.getTransaction(any())).thenReturn(transaction);
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        ProxyFactory proxy = new ProxyFactory(memberships);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(interceptor);
        MembershipServiceImpl transactional = (MembershipServiceImpl) proxy.getProxy();
        when(subscriptions.save(any())).thenThrow(new IllegalStateException("Test cancellation failure"));
        assertThrows(IllegalStateException.class, () -> transactional.cancelSubscription(10));
        verify(manager).rollback(transaction);
        verify(manager, never()).commit(any());
    }

    @Test
    void repeatingConfirmationDoesNotCreateAnotherPeriod() {
        pendingOrder(20);
        confirm(20);
        confirm(20);
        assertEquals(2, periods.size());
        verify(subscriptions, times(1)).saveAndFlush(any());
    }

    @Test
    void threeRenewalsKeepTheirFullDurationWithoutOverlapping() {
        for (int id = 20; id <= 22; id++) {
            pendingOrder(id);
            confirm(id);
        }
        for (int i = 1; i < periods.size(); i++) {
            assertEquals(periods.get(i - 1).getEndDate().plusDays(1), periods.get(i).getStartDate());
            assertEquals(periods.get(i).getStartDate().plusDays(29), periods.get(i).getEndDate());
        }
    }

    @Test
    void expiredSourceStartsTodayAndCancelledFuturePeriodDoesNotExtendIt() {
        source.setStatus("EXPIRED");
        source.setStartDate(LocalDate.now().minusDays(40));
        source.setEndDate(LocalDate.now().minusDays(10));
        periods.add(MemberSubscription.builder().id(15).memberId(4).packageId(1)
                .startDate(LocalDate.now().plusDays(1)).endDate(LocalDate.now().plusDays(100))
                .status("CANCELLED").build());
        pendingOrder(20);
        confirm(20);
        assertEquals(LocalDate.now(), periods.get(2).getStartDate());
    }

    @Test
    void sourceEndingTodayAndOneDayPackageHaveInclusiveDates() {
        source.setEndDate(LocalDate.now());
        pendingOrder(20);
        savedOrders.get(20).setPackageDurationDays(1);
        confirm(20);
        assertEquals(LocalDate.now().plusDays(1), periods.get(1).getStartDate());
        assertEquals(periods.get(1).getStartDate(), periods.get(1).getEndDate());
    }

    @Test
    void invalidSourceDatesOrPendingSourceCannotCreatePeriod() {
        pendingOrder(20);
        source.setStatus("PENDING_PAYMENT");
        assertThrows(ResponseStatusException.class, () -> confirm(20));
        source.setStatus("ACTIVE");
        source.setStartDate(source.getEndDate().plusDays(1));
        assertThrows(ResponseStatusException.class, () -> confirm(20));
        verify(subscriptions, never()).saveAndFlush(any());
    }

    @Test
    void confirmationAlwaysLocksOrderThenMemberBeforeReadingLastPeriod() {
        pendingOrder(20);
        confirm(20);
        var sequence = inOrder(orders, users, subscriptions);
        sequence.verify(orders).findByIdForUpdate(20);
        sequence.verify(users).findByIdForUpdate(4);
        sequence.verify(subscriptions).findLastActiveEndDate(4);
        sequence.verify(subscriptions).saveAndFlush(any());
    }

    @Test
    void staleVersionCannotCreatePeriodOrMarkInvoicePaid() {
        pendingOrder(20);
        savedOrders.get(20).setVersion(1);
        assertThrows(ResponseStatusException.class, () -> confirm(20));
        verify(subscriptions, never()).saveAndFlush(any());
        assertEquals("PENDING", savedInvoices.get(20).getPaymentStatus());
    }

    @Test
    void retryWithAnotherKeyReturnsSameConfirmedPeriod() {
        pendingOrder(20);
        confirm(20);
        ConfirmMembershipOrderRequest request = new ConfirmMembershipOrderRequest();
        request.setVersion(0);
        service.confirm(20, request, "another-key");
        verify(subscriptions, times(1)).saveAndFlush(any());
    }

    @Test
    void failedPersistenceRollsBackSpringTransactionInsteadOfCommitting() {
        pendingOrder(20);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        TransactionStatus transaction = mock(TransactionStatus.class);
        when(manager.getTransaction(any())).thenReturn(transaction);
        ProxyFactory proxy = new ProxyFactory(service);
        proxy.setProxyTargetClass(true);
        TransactionInterceptor interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(interceptor);
        service = (MembershipOrderService) proxy.getProxy();
        when(orders.saveAndFlush(any())).thenThrow(new IllegalStateException("Test persistence failure"));
        assertThrows(IllegalStateException.class, () -> confirm(20));
        verify(manager).rollback(transaction);
        verify(manager, never()).commit(any());
        // Mock chỉ xác minh Spring gọi rollback, không mô phỏng khả năng hoàn tác của SQL Server.
    }
}
