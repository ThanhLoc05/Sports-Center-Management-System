package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Classes;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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

    String MANAGEMENT_FILTER = """
            FROM dbo.classes c
            WHERE c.course_id IS NULL AND c.regular_class_id IS NULL
              AND (:status = 'all' OR c.status = :status)
              AND (:sportId IS NULL OR c.sport_id = :sportId)
              AND (:coachId IS NULL OR c.coach_id = :coachId)
              AND (:roomId IS NULL OR c.room_id = :roomId)
              AND (:fromDate IS NULL OR c.schedule_time >= CAST(:fromDate AS date))
              AND (:throughDate IS NULL OR c.schedule_time < DATEADD(day, 1, CAST(:throughDate AS date)))
              AND (:slotStart IS NULL OR (c.duration_minutes = 90 AND CAST(c.schedule_time AS time) = CAST(:slotStart AS time)))
              AND (:keyword = '' OR CHARINDEX(:keyword COLLATE Latin1_General_100_CI_AI,
                    REPLACE(REPLACE(c.class_name, N'đ', N'd'), N'Đ', N'D') COLLATE Latin1_General_100_CI_AI) > 0)
            """;

    @Query(value = "SELECT c.* " + MANAGEMENT_FILTER + " ORDER BY c.schedule_time DESC, c.class_id DESC",
            countQuery = "SELECT COUNT(*) " + MANAGEMENT_FILTER, nativeQuery = true)
    Page<Classes> findForManagement(@Param("status") String status, @Param("sportId") Integer sportId,
                                    @Param("keyword") String keyword, @Param("coachId") Integer coachId,
                                    @Param("roomId") Integer roomId, @Param("fromDate") java.time.LocalDate fromDate,
                                    @Param("throughDate") java.time.LocalDate throughDate,
                                    @Param("slotStart") java.time.LocalTime slotStart, Pageable pageable);

    @Query(value = """
            SELECT c.* FROM dbo.classes c
            WHERE c.status = 'SCHEDULED' AND c.schedule_time < :until
              AND DATEADD(minute, c.duration_minutes, c.schedule_time) > :from
            ORDER BY c.schedule_time, c.class_id
            """, nativeQuery = true)
    List<Classes> findScheduledOverlaps(@Param("from") LocalDateTime from, @Param("until") LocalDateTime until);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Classes c WHERE c.id = :classId")
    Optional<Classes> findByIdForUpdate(@Param("classId") Integer classId);

    @Query(value = "SELECT COUNT(*) FROM dbo.attendances WHERE class_id = :classId", nativeQuery = true)
    long countAttendance(@Param("classId") Integer classId);

    @Query(value = """
            SELECT COUNT(*) FROM dbo.class_waitlist WHERE class_id = :classId AND status IN ('QUEUED', 'INVITED')
            """, nativeQuery = true)
    long countActiveWaitlist(@Param("classId") Integer classId);

    @org.springframework.data.jpa.repository.Modifying
    @Query(value = """
            UPDATE dbo.class_waitlist SET status = 'CANCELLED'
            WHERE class_id = :classId AND status IN ('QUEUED', 'INVITED')
            """, nativeQuery = true)
    void closeActiveWaitlist(@Param("classId") Integer classId);

    @Query("SELECT c FROM Classes c WHERE c.status = 'SCHEDULED' " +
            "AND (c.coachId = :coachId OR c.roomId = :roomId) " +
            "AND c.scheduleTime < :endTime")
    List<Classes> findPotentialScheduleConflicts(
            @Param("coachId") Integer coachId,
            @Param("roomId") Integer roomId,
            @Param("endTime") LocalDateTime endTime);

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

    boolean existsByRoomId(Integer roomId);

    boolean existsByRoomIdAndStatusAndScheduleTimeAfterAndMaxCapacityGreaterThan(
            Integer roomId, String status, LocalDateTime scheduleTime, Integer maxCapacity);

    boolean existsBySportId(Integer sportId);

    /**
     * Find classes by status
     * @param status Class status (SCHEDULED, COMPLETED, CANCELLED)
     * @return List of classes
     */
    List<Classes> findByStatus(String status);

    List<Classes> findByStatusAndScheduleTimeLessThanEqual(String status, LocalDateTime scheduleTime);

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
