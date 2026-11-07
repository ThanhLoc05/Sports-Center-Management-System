package com.sportscenter.management.service;

import com.sportscenter.management.dto.Response.AuditLogResponse;
import com.sportscenter.management.entity.AuditLog;
import com.sportscenter.management.repository.AuditLogRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actorEmail, String action, String entityType,
                       Integer entityId, String ipAddress, String requestPath) {
        var actor = userRepository.findByEmail(actorEmail)
                .orElseThrow(() -> new IllegalStateException("Audit actor no longer exists."));
        auditLogRepository.save(AuditLog.builder()
                .actor(actor)
                .action(action)
                .entityType(entityType)
                .entityId(entityId)
                .ipAddress(ipAddress)
                .details(requestPath)
                .createdAt(LocalDateTime.now())
                .build());
    }

    @Transactional(readOnly = true)
    public Page<AuditLogResponse> search(Integer actorId, String action, String entityType,
                                         Integer entityId, LocalDate from, LocalDate to,
                                         String keyword, Pageable pageable) {
        LocalDateTime fromTime = from == null ? null : from.atStartOfDay();
        LocalDateTime toTime = to == null ? null : to.plusDays(1).atStartOfDay();
        return auditLogRepository.search(
                        actorId, blankToNull(action), blankToNull(entityType), entityId,
                        fromTime, toTime, blankToNull(keyword), pageable)
                .map(AuditLogService::toResponse);
    }

    @Transactional(readOnly = true)
    public AuditLogResponse get(Integer id) {
        return auditLogRepository.findWithActorById(id)
                .map(AuditLogService::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy nhật ký."));
    }

    public static AuditLogResponse toResponse(AuditLog log) {
        return AuditLogResponse.builder()
                .id(log.getId())
                .actorId(log.getActor().getId())
                .actorEmail(log.getActor().getEmail())
                .actorName(log.getActor().getFullName())
                .action(log.getAction())
                .entityType(log.getEntityType())
                .entityId(log.getEntityId())
                .details(log.getDetails())
                .oldValue(log.getOldValue())
                .newValue(log.getNewValue())
                .ipAddress(log.getIpAddress())
                .createdAt(log.getCreatedAt())
                .build();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
