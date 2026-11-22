package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.MemberSubscription;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class SubscriptionRolloverTest {
    private final LocalDate today = LocalDate.of(2026, 11, 20);
    private MemberSubscription period(int id, int start, int end, Integer successor) {
        return MemberSubscription.builder().id(id).startDate(today.plusDays(start)).endDate(today.plusDays(end))
                .status(successor == null ? "ACTIVE" : "EXPIRED").purchasedDays(30).rolledIntoId(successor).build();
    }

    @Test void refundOfLatestRenewalRestoresOldPackageAndItsOriginalEnd() {
        var old = period(1, -10, 19, 2);
        var renewed = period(2, 0, 49, null);
        SubscriptionRollover.cancel(renewed, List.of(old, renewed), today);
        assertEquals("ACTIVE", old.getStatus());
        assertNull(old.getRolledIntoId());
        assertEquals(today.plusDays(19), old.getEndDate());
        assertEquals("CANCELLED", renewed.getStatus());
    }

    @Test void refundOfIntermediateOrderRemovesOnlyItsPurchasedDays() {
        var old = period(1, -10, 19, 2);
        var middle = period(2, 0, 49, 3);
        var latest = period(3, 1, 79, null);
        var periods = List.of(old, middle, latest);
        SubscriptionRollover.cancel(middle, periods, today.plusDays(1));
        assertEquals(3, old.getRolledIntoId());
        assertEquals(today.plusDays(49), latest.getEndDate());
        SubscriptionRollover.cancel(latest, periods, today.plusDays(2));
        assertEquals("ACTIVE", old.getStatus());
        assertEquals("CANCELLED", middle.getStatus());
    }

    @Test void countsInclusiveDaysWithoutDoubleCountingOverlapsOrGaps() {
        assertEquals(7, SubscriptionRollover.remainingDays(List.of(period(1,-2,2,null),
                period(2,1,4,null),period(3,8,9,null)), today));
    }
}
