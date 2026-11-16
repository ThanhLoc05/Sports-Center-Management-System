package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ResetPasswordRequest {
    @NotBlank
    @Size(max = 128)
    private String token;

    @NotBlank(message = "Vui lòng nhập mật khẩu mới.")
    @Size(min = 8, max = 72, message = "Mật khẩu mới phải có ít nhất 8 ký tự và tối đa 72 byte UTF-8.")
    private String newPassword;
}
