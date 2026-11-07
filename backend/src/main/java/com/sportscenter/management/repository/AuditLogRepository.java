package com.sportscenter.management.repository;

import com.sportscenter.management.entity.AuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

public interface AuditLogRepository extends JpaRepository<AuditLog, Integer> {

    @Query("SELECT log FROM AuditLog log JOIN FETCH log.actor WHERE log.id = :id")
    java.util.Optional<AuditLog> findWithActorById(@Param("id") Integer id);

    @Query(
            value = """
                    SELECT log FROM AuditLog log
                    JOIN FETCH log.actor actor
                    WHERE (:actorId IS NULL OR actor.id = :actorId)
                      AND (:action IS NULL OR log.action = :action)
                      AND (:entityType IS NULL OR log.entityType = :entityType)
                      AND (:entityId IS NULL OR log.entityId = :entityId)
                      AND (:fromTime IS NULL OR log.createdAt >= :fromTime)
                      AND (:toTime IS NULL OR log.createdAt < :toTime)
                      AND (:keyword IS NULL
                           OR LOWER(actor.email) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(actor.fullName) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(log.action) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(log.entityType) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(COALESCE(log.details, '')) LIKE LOWER(CONCAT('%', :keyword, '%')))
                    """,
            countQuery = """
                    SELECT COUNT(log) FROM AuditLog log
                    JOIN log.actor actor
                    WHERE (:actorId IS NULL OR actor.id = :actorId)
                      AND (:action IS NULL OR log.action = :action)
                      AND (:entityType IS NULL OR log.entityType = :entityType)
                      AND (:entityId IS NULL OR log.entityId = :entityId)
                      AND (:fromTime IS NULL OR log.createdAt >= :fromTime)
                      AND (:toTime IS NULL OR log.createdAt < :toTime)
                      AND (:keyword IS NULL
                           OR LOWER(actor.email) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(actor.fullName) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(log.action) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(log.entityType) LIKE LOWER(CONCAT('%', :keyword, '%'))
                           OR LOWER(COALESCE(log.details, '')) LIKE LOWER(CONCAT('%', :keyword, '%')))
                    """
    )
    Page<AuditLog> search(
            @Param("actorId") Integer actorId,
            @Param("action") String action,
            @Param("entityType") String entityType,
            @Param("entityId") Integer entityId,
            @Param("fromTime") LocalDateTime fromTime,
            @Param("toTime") LocalDateTime toTime,
            @Param("keyword") String keyword,
            Pageable pageable
    );
}
