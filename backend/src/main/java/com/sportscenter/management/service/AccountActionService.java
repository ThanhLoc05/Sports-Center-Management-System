package com.sportscenter.management.service;

import com.sportscenter.management.entity.AccountActionToken;
import com.sportscenter.management.entity.AccountActionToken.Purpose;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.AccountActionTokenRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Base64;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AccountActionService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final AccountActionTokenRepository tokens;
    private final UserRepository users;
    private final JavaMailSender mailSender;
    private final PasswordEncoder passwordEncoder;
    private final AuditLogService auditLogService;

    @Value("${app.frontend-base-url:}")
    private String frontendBaseUrl;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    // Called only for public self-registration, never for staff-assisted provisioning.
    public void sendSignupVerification(User user) {
        issue(user, Purpose.VERIFY_EMAIL, user.getEmail(), Duration.ofHours(24));
    }

    /** Sends an OTP for a pending signup; no user row or frontend verification link exists yet. */
    public void sendMemberRegistrationCode(String fullName, String targetEmail, String code, Duration lifetime) {
        SimpleMailMessage mail = new SimpleMailMessage();
        if (fromAddress != null && !fromAddress.isBlank()) mail.setFrom(fromAddress);
        mail.setTo(targetEmail);
        mail.setSubject("Mã xác minh đăng ký Sportiva");
        mail.setText("Xin chào " + fullName + ",\n\n"
                + "Mã xác minh đăng ký tài khoản Sportiva của bạn là: " + code + "\n\n"
                + "Mã chỉ dùng một lần và hết hạn sau " + lifetime.toMinutes() + " phút. "
                + "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.");
        mailSender.send(mail);
    }

    public void sendPendingEmailVerification(User user, String newEmail) {
        issue(user, Purpose.VERIFY_EMAIL, newEmail, Duration.ofHours(24));
    }

    public void cancelVerification(Integer userId) {
        invalidate(userId, Purpose.VERIFY_EMAIL);
    }

    // Both routes return a generic success to prevent account/email enumeration.
    public void requestVerification(String email) {
        Optional<User> candidate = users.findByPendingEmailIgnoreCase(email)
                .or(() -> users.findByEmailIgnoreCase(email));
        candidate.filter(user -> "ACTIVE".equals(user.getStatus())
                        && (user.getPendingEmail() != null
                        || ("MEMBER".equals(user.getRole().getRoleName())
                        && !user.isEmailVerified())))
                .ifPresent(user -> sendGenerically(user, Purpose.VERIFY_EMAIL,
                        user.getPendingEmail() == null ? user.getEmail() : user.getPendingEmail(),
                        Duration.ofHours(24)));
    }

    public void requestPasswordReset(String email) {
        users.findByEmailIgnoreCase(email)
                .filter(user -> "ACTIVE".equals(user.getStatus()) && user.isEmailVerified())
                .ifPresent(user -> sendGenerically(user, Purpose.RESET_PASSWORD,
                        user.getEmail(), Duration.ofMinutes(30)));
    }

    public void verifyEmail(String rawToken) {
        LocalDateTime now = LocalDateTime.now();
        AccountActionToken token = findUsable(rawToken, Purpose.VERIFY_EMAIL, now);
        User user = users.findByIdForUpdate(token.getUserId())
                .orElseThrow(AccountActionService::invalidToken);
        if (!"ACTIVE".equals(user.getStatus())) throw invalidToken();

        if (user.getPendingEmail() != null
                && token.getTargetEmail().equalsIgnoreCase(user.getPendingEmail())) {
            if (users.existsByEmailIgnoreCaseAndIdNot(token.getTargetEmail(), user.getId())) {
                throw new IllegalArgumentException("Email đã được sử dụng");
            }
            user.setEmail(token.getTargetEmail());
            user.setPendingEmail(null);
            user.setEmailVerified(true);
        } else if (token.getTargetEmail().equalsIgnoreCase(user.getEmail())
                && "MEMBER".equals(user.getRole().getRoleName())
                && !user.isEmailVerified()) {
            user.setEmailVerified(true);
        } else {
            throw invalidToken();
        }

        users.save(user);
        consume(token, now);
        invalidate(user.getId(), Purpose.VERIFY_EMAIL);
        auditLogService.recordEmailVerification(user);
    }

    public void resetPassword(String rawToken, String newPassword) {
        if (newPassword == null || newPassword.length() < 8 || newPassword.length() > 128) {
            throw new IllegalArgumentException("Mật khẩu mới phải có từ 8 đến 128 ký tự");
        }
        LocalDateTime now = LocalDateTime.now();
        AccountActionToken token = findUsable(rawToken, Purpose.RESET_PASSWORD, now);
        User user = users.findByIdForUpdate(token.getUserId())
                .orElseThrow(AccountActionService::invalidToken);
        if (!"ACTIVE".equals(user.getStatus()) || !user.isEmailVerified()
                || !token.getTargetEmail().equalsIgnoreCase(user.getEmail())) {
            throw invalidToken();
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        users.save(user);
        consume(token, now);
        invalidate(user.getId(), Purpose.RESET_PASSWORD);
    }

    private void sendGenerically(User user, Purpose purpose, String targetEmail, Duration lifetime) {
        if (rateLimited(user.getId(), purpose)) return;
        try {
            issue(user, purpose, targetEmail, lifetime);
        } catch (MailException failure) {
            invalidate(user.getId(), purpose);
            log.error("Could not send {} email for user id {} ({})",
                    purpose, user.getId(), failure.getClass().getSimpleName());
        }
    }

    private void issue(User user, Purpose purpose, String targetEmail, Duration lifetime) {
        if (frontendBaseUrl == null || !frontendBaseUrl.matches("https?://[^\\s?#]+")) {
            throw new org.springframework.mail.MailSendException("Frontend URL is not configured");
        }
        if (rateLimited(user.getId(), purpose)) {
            throw new IllegalArgumentException("Đã gửi quá nhiều email. Vui lòng thử lại sau.");
        }
        invalidate(user.getId(), purpose);
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        LocalDateTime now = LocalDateTime.now();
        tokens.save(AccountActionToken.builder()
                .userId(user.getId())
                .purpose(purpose)
                .tokenHash(hash(rawToken))
                .targetEmail(targetEmail)
                .createdAt(now)
                .expiresAt(now.plus(lifetime))
                .build());

        String route = purpose == Purpose.VERIFY_EMAIL ? "/verify-email" : "/reset-password";
        String action = purpose == Purpose.VERIFY_EMAIL ? "xác minh email" : "đặt lại mật khẩu";
        String link = frontendBaseUrl.replaceAll("/+$", "") + route + "?token=" + rawToken;
        SimpleMailMessage mail = new SimpleMailMessage();
        if (fromAddress != null && !fromAddress.isBlank()) mail.setFrom(fromAddress);
        mail.setTo(targetEmail);
        mail.setSubject(purpose == Purpose.VERIFY_EMAIL
                ? "Xác minh tài khoản Sportiva"
                : "Đặt lại mật khẩu Sportiva");
        mail.setText("Xin chào " + user.getFullName() + ",\n\n"
                + "Mở liên kết sau để " + action + ":\n" + link + "\n\n"
                + "Liên kết chỉ dùng một lần và hết hạn sau "
                + (purpose == Purpose.VERIFY_EMAIL ? "24 giờ" : "30 phút") + ".");
        // Signup transaction rolls back if SMTP fails, avoiding an unreachable unverified account.
        mailSender.send(mail);
    }

    private AccountActionToken findUsable(String rawToken, Purpose purpose, LocalDateTime now) {
        if (rawToken == null || rawToken.isBlank()) throw invalidToken();
        AccountActionToken token = tokens.findUsableForUpdate(hash(rawToken), purpose)
                .orElseThrow(AccountActionService::invalidToken);
        if (token.getUsedAt() != null || !token.getExpiresAt().isAfter(now)) throw invalidToken();
        return token;
    }

    private void consume(AccountActionToken token, LocalDateTime now) {
        token.setUsedAt(now);
        tokens.save(token);
    }

    private void invalidate(Integer userId, Purpose purpose) {
        List<AccountActionToken> active =
                tokens.findByUserIdAndPurposeAndUsedAtIsNull(userId, purpose);
        LocalDateTime now = LocalDateTime.now();
        active.forEach(token -> token.setUsedAt(now));
        tokens.saveAll(active);
    }

    private boolean rateLimited(Integer userId, Purpose purpose) {
        LocalDateTime now = LocalDateTime.now();
        return tokens.countByUserIdAndPurposeAndCreatedAtAfter(
                        userId, purpose, now.minusMinutes(1)) > 0
                || tokens.countByUserIdAndPurposeAndCreatedAtAfter(
                        userId, purpose, now.minusHours(1)) >= 5;
    }

    private static IllegalArgumentException invalidToken() {
        return new IllegalArgumentException("Liên kết không hợp lệ hoặc đã hết hạn");
    }

    private static String hash(String rawToken) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("SHA-256 không khả dụng", failure);
        }
    }
}
