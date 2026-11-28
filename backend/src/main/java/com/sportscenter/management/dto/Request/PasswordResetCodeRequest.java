package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.*;
import lombok.*;

@Getter @Setter @NoArgsConstructor
public class PasswordResetCodeRequest {
    @NotBlank @Email @Size(max = 255)
    private String email;
    @NotBlank @Pattern(regexp = "[0-9]{6}", message = "Mã xác minh phải gồm 6 chữ số.")
    private String code;
}
