package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.dto.Response.ClassResponse;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * Service interface for managing classes and sports activities
 */
public interface ClassService {

    /**
     * Create a new class
     * @param request Class creation request
     * @return Created class response
     */
    ClassResponse createClass(ClassRequest request);

    /**
     * Get class by ID
     * @param classId Class ID
     * @return Class details
     */
    Optional<ClassResponse> getClassById(Integer classId);

    /**
     * Get all classes (with optional filters)
     * @param sportId Optional sport filter
     * @param coachId Optional coach filter
     * @return List of classes
     */
    List<ClassResponse> getAllClasses(Integer sportId, Integer coachId);

    /**
     * Get available classes (not full and scheduled for future)
     * @return List of available classes
     */
    List<ClassResponse> getAvailableClasses();

    /**
     * Get classes by sport ID
     * @param sportId Sport ID
     * @return List of classes for that sport
     */
    List<ClassResponse> getClassesBySport(Integer sportId);

    /**
     * Get current available capacity for a class
     * @param classId Class ID
     * @return Available spots count
     */
    int getAvailableCapacity(Integer classId);

    /**
     * Update class schedule/details
     * @param classId Class ID
     * @param request Updated class request
     * @return Updated class response
     */
    ClassResponse updateClass(Integer classId, ClassRequest request);

    /**
     * Cancel a class
     * @param classId Class ID
     * @return Canceled class response
     */
    ClassResponse cancelClass(Integer classId);

    /**
     * Get current booking count for a class
     * @param classId Class ID
     * @return Number of active bookings
     */
    long getCurrentBookingCount(Integer classId);
}
