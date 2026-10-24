package com.sportscenter.management.repository;

import com.sportscenter.management.entity.MemberSubscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Repository for MemberSubscription entity
 */
@Repository
public interface MemberSubscriptionRepository extends JpaRepository<MemberSubscription, Integer> {

    /**
     * Find active membership for a member
     * @param memberId Member ID
     * @return Active subscription if exists
     */
    @Query("SELECT ms FROM MemberSubscription ms WHERE ms.memberId = :memberId " +
            "AND ms.status = 'ACTIVE' AND ms.endDate >= CURRENT_DATE")
    Optional<MemberSubscription> findActiveMembership(@Param("memberId") Integer memberId);

    /**
     * Find all subscriptions for a member
     * @param memberId Member ID
     * @return List of all subscriptions
     */
    List<MemberSubscription> findByMemberId(Integer memberId);

    /**
     * Find subscriptions by status
     * @param status Subscription status (ACTIVE, EXPIRED, CANCELLED)
     * @return List of subscriptions
     */
    List<MemberSubscription> findByStatus(String status);

    /**
     * Find expired subscriptions
     * @param date Current date
     * @return List of expired subscriptions
     */
    @Query("SELECT ms FROM MemberSubscription ms WHERE ms.endDate < :date AND ms.status = 'ACTIVE'")
    List<MemberSubscription> findExpiredSubscriptions(@Param("date") LocalDate date);

    /**
     * Check if member has active subscription
     * @param memberId Member ID
     * @return true if it has active subscription
     */
    @Query("SELECT CASE WHEN COUNT(ms) > 0 THEN true ELSE false END FROM MemberSubscription ms " +
            "WHERE ms.memberId = :memberId AND ms.status = 'ACTIVE' AND ms.endDate >= CURRENT_DATE")
    boolean hasActiveMembership(@Param("memberId") Integer memberId);
}
