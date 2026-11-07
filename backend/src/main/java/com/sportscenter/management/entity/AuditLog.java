package com.sportscenter.management.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;

import java.time.LocalDateTime;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_log_id")
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private User actor;

    @Column(name = "action", nullable = false, length = 50)
    @Nationalized
    private String action;

    @Column(name = "entity_type", nullable = false, length = 100)
    @Nationalized
    private String entityType;

    @Column(name = "entity_id")
    private Integer entityId;

    @Column(name = "details", length = 1000)
    @Nationalized
    private String details;

    @Column(name = "old_value", columnDefinition = "NVARCHAR(MAX)")
    @Nationalized
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "NVARCHAR(MAX)")
    @Nationalized
    private String newValue;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
