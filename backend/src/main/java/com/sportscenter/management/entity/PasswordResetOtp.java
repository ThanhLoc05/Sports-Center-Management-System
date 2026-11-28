package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "password_reset_otps")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class PasswordResetOtp {
    @Id @Column(name = "email", length = 255)
    private String email;
    @Column(name = "user_id", nullable = false)
    private Integer userId;
    @Column(name = "otp_hash", nullable = false, length = 100)
    private String otpHash;
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
    @Column(name = "last_sent_at", nullable = false)
    private LocalDateTime lastSentAt;
    @Column(name = "resend_window_started_at", nullable = false)
    private LocalDateTime resendWindowStartedAt;
    @Column(name = "resend_count", nullable = false)
    private int resendCount;
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;
    @Column(name = "used_at")
    private LocalDateTime usedAt;
}
