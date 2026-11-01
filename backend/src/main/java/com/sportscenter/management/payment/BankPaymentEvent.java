package com.sportscenter.management.payment;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/** Lưu từng giao dịch đầu vào đã xác thực; provider_event_id duy nhất chống cộng tiền lặp khi webhook retry. */
@Entity @Table(name = "bank_payment_events")
@Getter @Setter @NoArgsConstructor
// TẠO MỚI: BankPaymentEvent — Entity lưu giao dịch SePay đã xác thực; mã giao dịch duy nhất để webhook gửi lại không cộng tiền hai lần.
public class BankPaymentEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "provider_event_id", nullable = false, unique = true) private Long providerEventId;
    @Column(name = "invoice_id", nullable = false) private Integer invoiceId;
    @Column(name = "payload_fingerprint", length = 64, nullable = false) private String payloadFingerprint;
    @Column(nullable = false, precision = 18, scale = 2) private BigDecimal amount;
    @Nationalized @Column(name = "transfer_content", length = 1000, nullable = false) private String transferContent;
    @Column(name = "bank_reference", length = 100) private String bankReference;
    @Column(name = "transaction_at", nullable = false) private LocalDateTime transactionAt;
    @Column(name = "received_at", nullable = false) private LocalDateTime receivedAt;
    @Column(length = 30, nullable = false) private String status;
}
