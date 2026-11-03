package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "membership_orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MembershipOrder {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "membership_order_id")
    private Integer id;

    @Column(name = "member_id", nullable = false)
    private Integer memberId;

    @Column(name = "package_id", nullable = false)
    private Integer packageId;

    @Column(name = "order_kind", nullable = false, length = 20)
    private String kind;

    @Column(name = "source_subscription_id")
    private Integer sourceSubscriptionId;

    @Column(name = "source_package_id")
    private Integer sourcePackageId;

    @Column(name = "package_name_snapshot", nullable = false)
    private String packageName;

    @Column(name = "package_price_snapshot", nullable = false, precision = 18, scale = 2)
    private BigDecimal packagePrice;

    @Column(name = "package_duration_days_snapshot", nullable = false)
    private Integer packageDurationDays;

    @Column(name = "package_status_snapshot", nullable = false, length = 20)
    private String packageStatus;

    @Column(name = "payment_method", nullable = false, length = 30)
    private String paymentMethod;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "idempotency_key", nullable = false, length = 100)
    private String idempotencyKey;

    @Column(name = "request_fingerprint", nullable = false, length = 64)
    private String requestFingerprint;

    @Column(name = "created_by", nullable = false)
    private Integer createdBy;

    @Column(name = "confirmed_by")
    private Integer confirmedBy;

    @Column(name = "bank_transaction_id", length = 100)
    private String bankTransactionId;

    @Column(name = "confirmation_key", length = 100)
    private String confirmationKey;

    @Column(name = "confirmation_fingerprint", length = 64)
    private String confirmationFingerprint;

    // BỔ SUNG: các snapshot bên dưới cố định số tiền/ngân hàng của từng đơn, không dùng lại giá/cài đặt hiện tại khi xác nhận.
    /** Số tiền thực trả độc lập với giá gói niêm yết, chỉ khác nhau khi demo QR được bật rõ ràng. */
    @Column(name = "payable_amount_snapshot", precision = 18, scale = 2) private java.math.BigDecimal payableAmountSnapshot;
    @Column(name = "demo_payment", nullable = false) private boolean demoPayment;

    /** Bản chụp tài khoản nhận tiền lúc tạo đơn; đổi Cài đặt không đổi QR của đơn cũ. */
    @Column(name = "bank_bin_snapshot", length = 6) private String bankBinSnapshot;
    @org.hibernate.annotations.Nationalized @Column(name = "bank_name_snapshot", length = 100) private String bankNameSnapshot;
    @Column(name = "bank_account_no_snapshot", length = 19) private String bankAccountNoSnapshot;
    @org.hibernate.annotations.Nationalized @Column(name = "bank_account_name_snapshot", length = 100) private String bankAccountNameSnapshot;
    @Column(name = "bank_gateway_snapshot", length = 100) private String bankGatewaySnapshot;

    @Version
    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;
}
