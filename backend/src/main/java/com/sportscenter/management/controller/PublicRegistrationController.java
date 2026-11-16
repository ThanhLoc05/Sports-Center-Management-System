package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Request.MemberRegistrationCodeRequest;
import com.sportscenter.management.dto.Request.MemberRegistrationEmailRequest;
import com.sportscenter.management.service.MemberRegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;

/** Đăng ký Member công khai: chỉ tạo tài khoản sau khi OTP email hợp lệ. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class PublicRegistrationController {
    private final MemberRegistrationService registrations;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> start(@Valid @RequestBody RegisterRequest input) {
        return codeDelivery(registrations.start(input));
    }

    @PostMapping("/register/verify-code")
    public Map<String, String> verify(@Valid @RequestBody MemberRegistrationCodeRequest input) {
        if (!registrations.verify(input.getEmail(), input.getCode())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Không thể xác minh mã. Hãy kiểm tra mã đã nhập hoặc yêu cầu mã mới.");
        }
        return Map.of("message", "Email đã được xác minh và tài khoản thành viên đã được tạo.");
    }

    @PostMapping("/register/resend-code")
    public Map<String, Object> resend(@Valid @RequestBody MemberRegistrationEmailRequest input) {
        return codeDelivery(registrations.resend(input.getEmail()));
    }

    private static Map<String, Object> codeDelivery(Instant expiresAt) {
        return Map.of(
                "message", "Mã xác minh đã được gửi tới email đăng ký.",
                "expiresAtEpochMs", expiresAt.toEpochMilli());
    }
}
