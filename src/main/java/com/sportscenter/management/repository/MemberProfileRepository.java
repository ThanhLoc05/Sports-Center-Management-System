package com.sportscenter.management.repository;

import com.sportscenter.management.entity.MemberProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for MemberProfile entity
 */
@Repository
public interface MemberProfileRepository extends JpaRepository<MemberProfile, Integer> {

    /**
     * Find member profile by member ID
     * @param memberId Member ID
     * @return MemberProfile if found
     */
    Optional<MemberProfile> findByMemberId(Integer memberId);

    /**
     * Check if profile exists for member
     * @param memberId Member ID
     * @return true if exists
     */
    boolean existsByMemberId(Integer memberId);
}
