package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Classes;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository for Classes entity
 */
@Repository
public interface ClassRepository extends JpaRepository<Classes, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Classes c WHERE c.id = :classId")
    Optional<Classes> findByIdForUpdate(@Param("classId") Integer classId);

    /**
     * Find classes by sport ID
     * @param sportId Sport ID
     * @return List of classes
     */
    List<Classes> findBySportId(Integer sportId);

    /**
     * Find classes by coach ID
     * @param coachId Coach ID
     * @return List of classes
     */
    List<Classes> findByCoachId(Integer coachId);

    /**
     * Find classes by sport and coach
     * @param sportId Sport ID
     * @param coachId Coach ID
     * @return List of classes
     */
    List<Classes> findBySportIdAndCoachId(Integer sportId, Integer coachId);

    /**
     * Find classes by room ID
     * @param roomId Room ID
     * @return List of classes
     */
    List<Classes> findByRoomId(Integer roomId);

    /**
     * Find classes by status
     * @param status Class status (SCHEDULED, COMPLETED, CANCELLED)
     * @return List of classes
     */
    List<Classes> findByStatus(String status);

    /**
     * Find classes scheduled between dates
     * @param startTime Start time
     * @param endTime End time
     * @return List of classes
     */
    @Query("SELECT c FROM Classes c WHERE c.scheduleTime BETWEEN :startTime AND :endTime")
    List<Classes> findByScheduleTimeBetween(@Param("startTime") LocalDateTime startTime,
                                            @Param("endTime") LocalDateTime endTime);

    /**
     * Find scheduled classes for future
     * @return List of future scheduled classes
     */
    @Query("SELECT c FROM Classes c WHERE c.status = 'SCHEDULED' AND c.scheduleTime > CURRENT_TIMESTAMP")
    List<Classes> findFutureScheduledClasses();

    /**
     * Count classes by sport
     * @param sportId Sport ID
     * @return Count of classes
     */
    long countBySportId(Integer sportId);
}
