package com.sportscenter.management.repository;

import com.sportscenter.management.entity.MembershipPackage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for MembershipPackage entity
 */
@Repository
public interface MembershipPackageRepository extends JpaRepository<MembershipPackage, Integer> {

    /**
     * Find all active packages
     * @return List of active packages
     */
    List<MembershipPackage> findByStatus(String status);

    /**
     * Find package by name
     * @param packageName Package name
     * @return Package if found
     */
    Optional<MembershipPackage> findByPackageName(String packageName);
}
