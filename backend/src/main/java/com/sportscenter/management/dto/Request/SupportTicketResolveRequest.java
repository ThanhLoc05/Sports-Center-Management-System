package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SupportTicketResolveRequest {

    @NotBlank(message = "Nội dung phản hồi không được để trống")
    private String response;
}
