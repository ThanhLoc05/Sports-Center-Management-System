package com.sportscenter.management.repository;

import com.sportscenter.management.entity.ClassBooking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Repository for ClassBooking entity
 */
@Repository
public interface ClassBookingRepository extends JpaRepository<ClassBooking, Integer> {

    /**
     * Find booking by class and member
     * @param classId Class ID
     * @param memberId Member ID
     * @return Booking if found
     */
    Optional<ClassBooking> findByClassIdAndMemberId(Integer classId, Integer memberId);

    /**
     * Find all bookings for a class
     * @param classId Class ID
     * @return List of bookings
     */
    List<ClassBooking> findByClassId(Integer classId);

    /**
     * Find all bookings for a member
     * @param memberId Member ID
     * @return List of bookings
     */
    List<ClassBooking> findByMemberId(Integer memberId);

    /**
     * Find bookings by status
     * @param status Booking status (BOOKED, CANCELLED)
     * @return List of bookings
     */
    List<ClassBooking> findByStatus(String status);

    /**
     * Count active bookings for a class
     * @param classId Class ID
     * @param status Status filter
     * @return Count of bookings
     */
    long countByClassIdAndStatus(Integer classId, String status);

    /**
     * Count total bookings for a member
     * @param memberId Member ID
     * @return Count of bookings
     */
    long countByMemberId(Integer memberId);

    /**
     * Check if member is booked in class
     * @param classId Class ID
     * @param memberId Member ID
     * @return true if booked
     */
    boolean existsByClassIdAndMemberId(Integer classId, Integer memberId);

    /**
     * Update booking status for all members in a class
     * @param classId Class ID
     * @param status New status
     */
    @Modifying
    @Transactional
    @Query("UPDATE ClassBooking cb SET cb.status = :status WHERE cb.classId = :classId")
    void updateBookingStatusByClass(@Param("classId") Integer classId, @Param("status") String status);

    /**
     * Delete all bookings for a class
     * @param classId Class ID
     */
    @Modifying
    @Transactional
    @Query("DELETE FROM ClassBooking cb WHERE cb.classId = :classId")
    void deleteByClassId(@Param("classId") Integer classId);
}
