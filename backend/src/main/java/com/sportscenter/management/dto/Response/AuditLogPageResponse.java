package com.sportscenter.management.dto.Response;

import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLogPageResponse {
    private List<AuditLogResponse> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
}
