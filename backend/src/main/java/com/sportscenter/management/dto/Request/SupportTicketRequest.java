package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportTicketRequest {

    @NotBlank(message = "Tiêu đề yêu cầu hỗ trợ không được để trống")
    private String subject;

    @NotBlank(message = "Nội dung yêu cầu không được để trống")
    private String content;
}
