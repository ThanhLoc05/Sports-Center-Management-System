package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class AccountTokenRequest {
    @NotBlank
    @Size(max = 128)
    private String token;
}
