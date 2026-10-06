package com.sportscenter.management.repository;

import com.sportscenter.management.entity.Invoice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, Integer> {

    List<Invoice> findByMemberId(Integer memberId);

    List<Invoice> findByPaymentStatus(String paymentStatus);

    List<Invoice> findByPaymentStatusAndCreatedAtBetween(
            String paymentStatus, LocalDateTime startDate, LocalDateTime endDate);

    // Thống kê tổng doanh thu theo khoảng thời gian
    @Query("SELECT COALESCE(SUM(i.amount), 0) FROM Invoice i " +
            "WHERE i.paymentStatus = 'PAID' AND i.createdAt BETWEEN :startDate AND :endDate")
    BigDecimal calculateTotalRevenue(
            @Param("startDate") LocalDateTime startDate,
            @Param("endDate") LocalDateTime endDate
    );
}
