package com.sportscenter.management.repository;

import com.sportscenter.management.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for User entity - handles CRUD operations
 */
@Repository
public interface UserRepository extends JpaRepository<User, Integer> {

    /**
     * Find user by email
     * @param email User email
     * @return User if found
     */
    @EntityGraph(attributePaths = "role")
    Optional<User> findByEmail(String email);

    /**
     * Check if email exists
     * @param email User email
     * @return true if exists
     */
    boolean existsByEmail(String email);

    /**
     * Check if phone exists
     * @param phone User phone
     * @return true if exists
     */
    boolean existsByPhone(String phone);

    /**
     * Find users by role ID
     * @param roleId Role ID
     * @return List of users with that role
     */
    List<User> findByRole_Id(Integer roleId);

    /**
     * Find users by status
     * @param status User status (ACTIVE, INACTIVE, BLOCKED)
     * @return List of users with that status
     */
    List<User> findByStatus(String status);

    /**
     * Find users by role ID and status
     * @param roleId Role ID
     * @param status User status
     * @return List of matching users
     */
    List<User> findByRole_IdAndStatus(Integer roleId, String status);
}
