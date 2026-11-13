package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegisterRequest {

    @NotBlank(message = "Email không được để trống.")
    @Email(message = "Email không đúng định dạng.")
    @Pattern(regexp = "^[^\\s@]+@[^\\s@]+\\.com$", message = "Email phải kết thúc bằng .com viết thường.")
    @Size(max = 255, message = "Email không được vượt quá 255 ký tự.")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống.")
    @Size(min = 6, max = 128, message = "Mật khẩu phải có từ 6 đến 128 ký tự.")
    private String password;

    @NotBlank(message = "Họ và tên không được để trống.")
    @Size(min = 2, max = 100, message = "Họ và tên phải có từ 2 đến 100 ký tự.")
    private String fullName;

    @NotBlank(message = "Số điện thoại không được để trống.")
    @Pattern(regexp = "[+0-9 ()-]{9,20}", message = "Số điện thoại không đúng định dạng.")
    private String phone;
}
