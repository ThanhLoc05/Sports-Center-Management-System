package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;
import java.time.LocalDateTime;

@Entity
@Table(name = "general_notifications")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class GeneralNotification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name="sender_id",nullable=false) private Integer senderId;
    @Column(name="recipient_id",nullable=false) private Integer recipientId;
    @Nationalized @Column(nullable=false,length=150) private String title;
    @Nationalized @Column(nullable=false,length=4000) private String content;
    @Nationalized @Column(length=500) private String link;
    @Column(name="created_at",nullable=false) private LocalDateTime createdAt;
    @Column(name="read_at") private LocalDateTime readAt;
}
