package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MembershipPackageDeletionTest {
    private final MemberSubscriptionRepository subscriptions = mock(MemberSubscriptionRepository.class);
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final MembershipOrderRepository orders = mock(MembershipOrderRepository.class);
    private final MembershipServiceImpl service = new MembershipServiceImpl(
            subscriptions, packages, mock(UserRepository.class), mock(InvoiceRepository.class), orders);

    @Test
    void deletesPackageWithoutSubscriptionsOrOrders() {
        MembershipPackage pkg = MembershipPackage.builder().id(5).build();
        when(packages.findById(5)).thenReturn(Optional.of(pkg));
        when(subscriptions.existsByPackageId(5)).thenReturn(false);
        when(orders.existsByPackageIdOrSourcePackageId(5, 5)).thenReturn(false);

        service.deletePackage(5);

        verify(packages).delete(pkg);
    }

    @Test
    void rejectsPackageWithSubscriptionHistory() {
        when(packages.findById(5)).thenReturn(Optional.of(MembershipPackage.builder().id(5).build()));
        when(subscriptions.existsByPackageId(5)).thenReturn(true);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class, () -> service.deletePackage(5));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(packages, never()).delete(any(MembershipPackage.class));
    }

    @Test
    void rejectsPackageReferencedByOrderHistory() {
        when(packages.findById(5)).thenReturn(Optional.of(MembershipPackage.builder().id(5).build()));
        when(subscriptions.existsByPackageId(5)).thenReturn(false);
        when(orders.existsByPackageIdOrSourcePackageId(5, 5)).thenReturn(true);

        ResponseStatusException error = assertThrows(
                ResponseStatusException.class, () -> service.deletePackage(5));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(packages, never()).delete(any(MembershipPackage.class));
    }
}
