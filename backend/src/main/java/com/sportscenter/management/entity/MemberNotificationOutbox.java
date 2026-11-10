package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

/** Mapped for Hibernate validate; atomic claims and inserts use JDBC on the same datasource. */
@Entity @Table(name="member_notification_outbox") @Getter @NoArgsConstructor
public class MemberNotificationOutbox {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="event_key",nullable=false,length=200) private String eventKey;
    @Column(name="recipient_id",nullable=false) private Integer recipientId;
    @Column(name="notification_id",nullable=false) private Long notificationId;
    @Column(nullable=false,length=12) private String state;
    @Column(nullable=false) private Integer attempts;
    @Column(name="next_attempt_at",nullable=false) private LocalDateTime nextAttemptAt;
    @Column(name="lease_until") private LocalDateTime leaseUntil;
    @Column(name="lease_token",length=36) private String leaseToken;
    @Column(name="created_at",nullable=false) private LocalDateTime createdAt;
    @Column(name="published_at") private LocalDateTime publishedAt;
}
