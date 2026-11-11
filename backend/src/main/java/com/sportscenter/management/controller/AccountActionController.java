package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.*;
import com.sportscenter.management.service.AccountActionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** Public capability-token endpoints: never return tokens or expose account existence. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class AccountActionController {
    private final AccountActionService actions;
    @PostMapping("/verify-email")
    public Map<String,String> verify(@Valid @RequestBody AccountTokenRequest input) {
        actions.verifyEmail(input.getToken()); return Map.of("message", "Email đã được xác minh.");
    }
    @PostMapping("/resend-verification")
    public Map<String,String> resend(@Valid @RequestBody EmailActionRequest input) {
        actions.requestVerification(input.getEmail().trim().toLowerCase(java.util.Locale.ROOT)); return generic();
    }
    @PostMapping("/forgot-password")
    public Map<String,String> forgot(@Valid @RequestBody EmailActionRequest input) {
        actions.requestPasswordReset(input.getEmail().trim().toLowerCase(java.util.Locale.ROOT)); return generic();
    }
    @PostMapping("/reset-password")
    public Map<String,String> reset(@Valid @RequestBody ResetPasswordRequest input) {
        actions.resetPassword(input.getToken(), input.getNewPassword()); return Map.of("message", "Đã đặt lại mật khẩu.");
    }
    private Map<String,String> generic() { return Map.of("message", "Nếu email phù hợp với tài khoản, hướng dẫn sẽ được gửi."); }
}
