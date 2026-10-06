package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Room;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Repository for Room entity
 */
@Repository
public interface RoomRepository extends JpaRepository<Room, Integer> {

    /**
     * Find room by name
     * @param roomName Room name
     * @return Room if found
     */
    Optional<Room> findByRoomName(String roomName);

    /**
     * Find rooms by capacity
     * @param capacity Room capacity
     * @return List of rooms with capacity >= given value
     */
    List<Room> findByCapacityGreaterThanEqual(Integer capacity);

    /**
     * Check if room exists by name
     * @param roomName Room name
     * @return true if exists
     */
    boolean existsByRoomName(String roomName);
}
