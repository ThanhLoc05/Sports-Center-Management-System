package com.sportscenter.management.repository;

import com.sportscenter.management.entity.MembershipOrder;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MembershipOrderRepository extends JpaRepository<MembershipOrder, Integer> {
    Optional<MembershipOrder> findByCreatedByAndIdempotencyKey(Integer createdBy, String idempotencyKey);

    boolean existsByMemberIdAndStatus(Integer memberId, String status);

    boolean existsByBankTransactionId(String bankTransactionId);

    List<MembershipOrder> findByMemberIdOrderByCreatedAtDesc(Integer memberId);

    List<MembershipOrder> findAllByOrderByCreatedAtDesc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from MembershipOrder o where o.id = :id")
    Optional<MembershipOrder> findByIdForUpdate(@Param("id") Integer id);
}
