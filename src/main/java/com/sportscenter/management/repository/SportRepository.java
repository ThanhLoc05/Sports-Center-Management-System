package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Sport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository for Sport entity
 */
@Repository
public interface SportRepository extends JpaRepository<Sport, Integer> {

    /**
     * Find sport by name
     * @param sportName Sport name
     * @return Sport if found
     */
    Optional<Sport> findBySportName(String sportName);

    /**
     * Check if sport exists by name
     * @param sportName Sport name
     * @return true if exists
     */
    boolean existsBySportName(String sportName);
}
