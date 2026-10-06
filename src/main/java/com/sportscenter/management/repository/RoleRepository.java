package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for Role entity
 */
@Repository
public interface RoleRepository extends JpaRepository<Role, Integer> {

    /**
     * Find role by name
     * @param roleName Role name
     * @return Role if found
     */
    Optional<Role> findByRoleName(String roleName);

    /**
     * Check if role exists by name
     * @param roleName Role name
     * @return true if exists
     */
    boolean existsByRoleName(String roleName);
}
