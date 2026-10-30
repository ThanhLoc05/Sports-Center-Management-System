package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SportRequest {

    @NotBlank(message = "Tên bộ môn là bắt buộc")
    private String sportName;

    private String description;
}