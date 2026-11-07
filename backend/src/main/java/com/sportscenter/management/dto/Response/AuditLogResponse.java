package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLogResponse {
    private Integer id;
    private Integer actorId;
    private String actorEmail;
    private String actorName;
    private String action;
    private String entityType;
    private Integer entityId;
    private String details;
    private String oldValue;
    private String newValue;
    private String ipAddress;
    private LocalDateTime createdAt;
}
