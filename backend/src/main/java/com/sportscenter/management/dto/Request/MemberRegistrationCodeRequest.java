package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class MemberRegistrationCodeRequest {
    @NotBlank(message = "Email không được để trống.")
    @Email(message = "Email không đúng định dạng.")
    @Pattern(regexp = "^[^\\s@]+@[^\\s@]+\\.com$", message = "Email phải kết thúc bằng .com viết thường.")
    @Size(max = 255, message = "Email không được vượt quá 255 ký tự.")
    private String email;

    @NotBlank(message = "Mã xác minh không được để trống.")
    @Pattern(regexp = "^\\d{6}$", message = "Mã xác minh phải gồm 6 chữ số.")
    private String code;
}
