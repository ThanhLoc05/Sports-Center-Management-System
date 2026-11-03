package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Attendance;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Repository for Attendance entity
 */
@Repository
public interface AttendanceRepository extends JpaRepository<Attendance, Integer> {

    /**
     * Find attendance by class and member
     * @param classId Class ID
     * @param memberId Member ID
     * @return Attendance if found
     */
    Optional<Attendance> findByClassIdAndMemberId(Integer classId, Integer memberId);

    /**
     * Find all attendance records for a class
     * @param classId Class ID
     * @return List of attendance records
     */
    List<Attendance> findByClassId(Integer classId);

    /**
     * Find all attendance records for a member
     * @param memberId Member ID
     * @return List of attendance records
     */
    List<Attendance> findByMemberId(Integer memberId);

    /**
     * Find attendance records by status
     * @param classId Class ID
     * @param status Attendance status (PRESENT, ABSENT)
     * @return List of attendance records
     */
    List<Attendance> findByClassIdAndStatus(Integer classId, String status);

    /**
     * Find attendance records for member in date range
     * @param memberId Member ID
     * @param startTime Start time
     * @param endTime End time
     * @return List of attendance records
     */
    List<Attendance> findByMemberIdAndCheckedInAtBetween(Integer memberId, LocalDateTime startTime, LocalDateTime endTime);

    /**
     * Count present attendance for a class
     * @param classId Class ID
     * @return Count of present records
     */
    long countByClassIdAndStatus(Integer classId, String status);

    /**
     * Count attendance for member in date range
     * @param memberId Member ID
     * @param status Status filter
     * @return Count of records
     */
    long countByMemberIdAndStatus(Integer memberId, String status);
}
