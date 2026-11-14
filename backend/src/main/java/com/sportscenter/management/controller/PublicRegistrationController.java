package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.MemberRegistrationCodeRequest;
import com.sportscenter.management.dto.Request.MemberRegistrationEmailRequest;
import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.service.MemberRegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/** Public self-registration endpoints. No account exists until its email OTP is confirmed. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class PublicRegistrationController {
    private final MemberRegistrationService registrations;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, String> start(@Valid @RequestBody RegisterRequest input) {
        registrations.start(input);
        return Map.of("message", "Nếu yêu cầu hợp lệ, mã xác minh đã được gửi tới email.");
    }

    @PostMapping("/register/verify-code")
    public Map<String, String> verify(@Valid @RequestBody MemberRegistrationCodeRequest input) {
        if (!registrations.verify(input.getEmail(), input.getCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Mã không đúng, đã hết hạn hoặc vượt quá số lần thử. Vui lòng yêu cầu mã mới.");
        }
        return Map.of("message", "Email đã được xác minh và tài khoản thành viên đã được tạo.");
    }

    @PostMapping("/register/resend-code")
    public Map<String, String> resend(@Valid @RequestBody MemberRegistrationEmailRequest input) {
        registrations.resend(input.getEmail());
        return Map.of("message", "Nếu yêu cầu đăng ký còn hiệu lực, mã xác minh sẽ được gửi tới email.");
    }
}
