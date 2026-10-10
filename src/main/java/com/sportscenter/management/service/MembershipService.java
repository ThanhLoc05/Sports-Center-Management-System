package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipPackageResponse;

import java.util.List;
import java.util.Optional;

/**
 * Service interface for managing membership packages and subscriptions
 */
public interface MembershipService {

    /**
     * Create a new membership subscription for a member
     * @param request Subscription request
     * @return Created subscription response
     */
    MemberSubscriptionResponse subscribeMembershipPackage(MemberSubscriptionRequest request);

    /**
     * Get member's active subscription
     * @param memberId Member ID
     * @return Current subscription if exists
     */
    Optional<MemberSubscriptionResponse> getActiveMembership(Integer memberId);

    /**
     * Get all subscriptions for a member
     * @param memberId Member ID
     * @return List of subscriptions
     */
    List<MemberSubscriptionResponse> getMemberSubscriptionHistory(Integer memberId);

    /**
     * Renew member's subscription
     * @param subscriptionId Current subscription ID
     * @param packageId New package ID
     * @return Renewed subscription response
     */
    MemberSubscriptionResponse renewSubscription(Integer subscriptionId, Integer packageId);

    /**
     * Cancel a membership subscription
     * @param subscriptionId Subscription ID
     * @return Cancelled subscription response
     */
    MemberSubscriptionResponse cancelSubscription(Integer subscriptionId);

    /**
     * Check if member has active membership
     * @param memberId Member ID
     * @return true if member has active subscription
     */
    boolean hasMembership(Integer memberId);

    /**
     * Get member's subscription expiration date
     * @param memberId Member ID
     * @return Subscription end date as string
     */
    String getSubscriptionExpirationDate(Integer memberId);
    List<MembershipPackageResponse> getAllPackages();
    MembershipPackageResponse createPackage(com.sportscenter.management.dto.Request.MembershipPackageRequest request);
}
