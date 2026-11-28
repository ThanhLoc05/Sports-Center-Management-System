package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.*;
import com.sportscenter.management.service.AccountActionService;
import com.sportscenter.management.service.PasswordResetOtpService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import java.util.Map;

/** Public account actions; only a verified OTP can issue a short-lived reset capability. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class AccountActionController {
    private final AccountActionService actions;
    private final PasswordResetOtpService passwordResetOtps;
    @PostMapping("/verify-email")
    public Map<String,String> verify(@Valid @RequestBody AccountTokenRequest input) {
        actions.verifyEmail(input.getToken()); return Map.of("message", "Email đã được xác minh.");
    }
    @PostMapping("/resend-verification")
    public Map<String,String> resend(@Valid @RequestBody EmailActionRequest input) {
        actions.requestVerification(input.getEmail().trim().toLowerCase(java.util.Locale.ROOT)); return generic();
    }
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String,Object> forgot(@Valid @RequestBody EmailActionRequest input) {
        return resetCodeDelivery(input.getEmail());
    }
    @PostMapping("/forgot-password/resend-code")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String,Object> resendResetCode(@Valid @RequestBody EmailActionRequest input) {
        return resetCodeDelivery(input.getEmail());
    }
    @PostMapping("/forgot-password/verify-code")
    public ResponseEntity<?> verifyResetCode(@Valid @RequestBody PasswordResetCodeRequest input) {
        var result = passwordResetOtps.verify(input.getEmail(), input.getCode());
        if (result.grant() != null) return ResponseEntity.ok(result.grant());
        boolean exhausted = result.attemptsRemaining() == 0;
        return ResponseEntity.status(exhausted ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST)
                .body(Map.of("message", exhausted ? "Bạn đã nhập sai 5 lần. Vui lòng yêu cầu mã mới."
                        : "Mã không đúng. Bạn còn " + result.attemptsRemaining() + " lần thử.",
                        "attemptsRemaining", result.attemptsRemaining()));
    }
    @PostMapping("/reset-password")
    public Map<String,String> reset(@Valid @RequestBody ResetPasswordRequest input) {
        actions.resetPassword(input.getToken(), input.getNewPassword()); return Map.of("message", "Đã đặt lại mật khẩu.");
    }
    private Map<String,String> generic() { return Map.of("message", "Nếu email phù hợp với tài khoản, hướng dẫn sẽ được gửi."); }
    private Map<String,Object> resetCodeDelivery(String email) {
        return Map.of("message", "Nếu email phù hợp với tài khoản, mã OTP sẽ được gửi.",
                "expiresAtEpochMs", passwordResetOtps.requestCode(email).toEpochMilli());
    }
}
