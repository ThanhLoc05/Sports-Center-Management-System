package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, Integer> {

    List<Invoice> findByMemberId(Integer memberId);

    Optional<Invoice> findFirstBySubscriptionIdOrderByCreatedAtDesc(Integer subscriptionId);

    Optional<Invoice> findByMembershipOrderId(Integer membershipOrderId);

    List<Invoice> findByPaymentStatus(String paymentStatus);

    List<Invoice> findByPaymentStatusAndCreatedAtBetween(
            String paymentStatus, LocalDateTime startDate, LocalDateTime endDate);

    // Thống kê tổng tiền thực thu (PAID) theo thời điểm thanh toán (paidAt)
    @Query("SELECT COALESCE(SUM(i.amount), 0) FROM Invoice i " +
            "WHERE i.paymentStatus = 'PAID' AND COALESCE(i.paidAt, i.createdAt) BETWEEN :startDate AND :endDate")
    BigDecimal calculateTotalRevenue(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // Thống kê tổng tiền hoàn (REFUNDED) theo thời điểm hoàn tiền (refundedAt)
    @Query("SELECT COALESCE(SUM(i.amount), 0) FROM Invoice i " +
            "WHERE i.paymentStatus = 'REFUNDED' AND COALESCE(i.refundedAt, i.createdAt) BETWEEN :startDate AND :endDate")
    BigDecimal calculateTotalRefunded(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    // Lấy danh sách hóa đơn đã thanh toán theo khoảng thời gian thực thu
    @Query("SELECT i FROM Invoice i " +
            "WHERE i.paymentStatus = 'PAID' AND COALESCE(i.paidAt, i.createdAt) BETWEEN :startDate AND :endDate")
    List<Invoice> findPaidInvoicesBetween(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT COUNT(i) FROM Invoice i " +
            "WHERE i.paymentStatus = 'PAID' AND COALESCE(i.paidAt, i.createdAt) BETWEEN :startDate AND :endDate")
    long countPaidInvoices(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );

    @Query("SELECT COUNT(i) FROM Invoice i " +
            "WHERE i.paymentStatus = 'REFUNDED' AND COALESCE(i.refundedAt, i.createdAt) BETWEEN :startDate AND :endDate")
    long countRefundedInvoices(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );
}
