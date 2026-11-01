package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportTicketResponse {

    private Integer id;
    private Integer memberId;
    private String subject;
    private String content;
    private String status;
    private String response;
    private Integer resolvedBy;
    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
}
