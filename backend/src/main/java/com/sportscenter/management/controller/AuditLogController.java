package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.AuditLogPageResponse;
import com.sportscenter.management.dto.Response.AuditLogResponse;
import com.sportscenter.management.service.AuditLogService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/v1/audit-logs")
@RequiredArgsConstructor
@PreAuthorize("hasRole('CENTER_MANAGER')")
public class AuditLogController {

    private final AuditLogService auditLogService;

    @GetMapping
    public AuditLogPageResponse list(
            @RequestParam(required = false) Integer actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) Integer entityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "25") @Min(1) @Max(100) int size) {
        validateDates(from, to);
        Page<AuditLogResponse> result = auditLogService.search(
                actorId, action, entityType, entityId, from, to, keyword,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return AuditLogPageResponse.builder()
                .content(result.getContent())
                .page(result.getNumber())
                .size(result.getSize())
                .totalElements(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    @GetMapping(value = "/export", produces = "text/csv")
    public ResponseEntity<String> export(
            @RequestParam(required = false) Integer actorId,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) Integer entityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String keyword) {
        validateDates(from, to);
        Page<AuditLogResponse> result = auditLogService.search(
                actorId, action, entityType, entityId, from, to, keyword,
                PageRequest.of(0, 10_000, Sort.by(Sort.Direction.DESC, "createdAt")));
        String csv = toCsv(result.getContent());
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"audit-logs.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(csv);
    }

    @GetMapping("/{auditId}")
    public AuditLogResponse get(@PathVariable @Min(1) Integer auditId) {
        return auditLogService.get(auditId);
    }

    private static void validateDates(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new ResponseStatusException(BAD_REQUEST, "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.");
        }
    }

    private static String toCsv(List<AuditLogResponse> rows) {
        StringBuilder csv = new StringBuilder("\uFEFFThời gian,Người thực hiện,Email,Thao tác,Loại dữ liệu,ID dữ liệu,Địa chỉ IP,Đường dẫn\r\n");
        for (AuditLogResponse row : rows) {
            csv.append(csvCell(row.getCreatedAt()))
                    .append(',').append(csvCell(row.getActorName()))
                    .append(',').append(csvCell(row.getActorEmail()))
                    .append(',').append(csvCell(row.getAction()))
                    .append(',').append(csvCell(row.getEntityType()))
                    .append(',').append(csvCell(row.getEntityId()))
                    .append(',').append(csvCell(row.getIpAddress()))
                    .append(',').append(csvCell(row.getDetails()))
                    .append("\r\n");
        }
        return csv.toString();
    }

    private static String csvCell(Object value) {
        String text = value == null ? "" : value.toString();
        if (text.matches("(?s)^\\s*[=+\\-@].*")) text = "'" + text;
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }
}
