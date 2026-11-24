package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "invoices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "invoice_id")
    private Integer id;

    @Column(name = "subscription_id")
    private Integer subscriptionId;

    @Column(name = "membership_order_id")
    private Integer membershipOrderId;

    @Column(name = "course_order_id")
    private Integer courseOrderId;

    @Column(name = "member_id", nullable = false)
    private Integer memberId;

    @Column(name = "receptionist_id")
    private Integer receptionistId;

    @Column(name = "amount", nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "currency", nullable = false, length = 3)
    private String currency;

    @Column(name = "payment_method", nullable = false)
    private String paymentMethod;

    @Column(name = "payment_status", nullable = false)
    private String paymentStatus;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @org.hibernate.annotations.Nationalized
    @Column(name = "refund_reason", length = 500)
    private String refundReason;

    @Column(name = "refund_method", length = 20)
    private String refundMethod;

    @org.hibernate.annotations.Nationalized
    @Column(name = "refund_reference", length = 120)
    private String refundReference;

    @Column(name = "refunded_by")
    private Integer refundedBy;

    @Column(name = "refund_requested_at")
    private LocalDateTime refundRequestedAt;

    @org.hibernate.annotations.Nationalized
    @Column(name = "refund_request_reason", length = 500)
    private String refundRequestReason;

    @Column(name = "refund_requested_amount", precision = 18, scale = 2)
    private BigDecimal refundRequestedAmount;

    @Column(name = "refund_requested_percent")
    private Integer refundRequestedPercent;

    @Column(name = "refunded_amount", precision = 18, scale = 2)
    private BigDecimal refundedAmount;

    // Hai mã định danh tạo thành cùng một mã thanh toán cho đơn, thông báo và bước đối chiếu khi hoàn.
    public String paymentReference() {
        return "HD" + id + " TV" + memberId;
    }

    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;
}
