package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/** Temporary registration data; a real User is created only after the OTP is verified. */
@Entity
@Table(name = "pending_member_registrations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PendingMemberRegistration {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "registration_id")
    private Long id;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "phone", nullable = false, length = 20)
    private String phone;

    @Column(name = "otp_hash", nullable = false, length = 100)
    private String otpHash;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "last_sent_at", nullable = false)
    private LocalDateTime lastSentAt;

    @Column(name = "resend_window_started_at", nullable = false)
    private LocalDateTime resendWindowStartedAt;

    @Builder.Default
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    @Builder.Default
    @Column(name = "resend_count", nullable = false)
    private int resendCount = 0;
}
