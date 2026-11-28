package com.sportscenter.management.service;

import com.sportscenter.management.entity.PasswordResetOtp;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.PasswordResetOtpRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.*;
import java.util.Locale;
import java.util.Optional;

/** Password-reset codes have their own persistence, counters and mail purpose. */
@Service @RequiredArgsConstructor @Slf4j
public class PasswordResetOtpService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration LIFETIME = Duration.ofMinutes(1);
    private static final int MAX_ATTEMPTS = 5;
    private static final int MAX_RESENDS = 5;

    private final PasswordResetOtpRepository otps;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final JavaMailSender mail;
    private final AccountActionService actions;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    public record Verification(AccountActionService.PasswordResetGrant grant, int attemptsRemaining) {}

    @Transactional
    public Instant requestCode(String rawEmail) {
        String email = normalize(rawEmail);
        Optional<User> current = lockEligibleUser(email);
        if (current.isEmpty()) return Instant.now().plus(LIFETIME);
        User user = current.get();
        LocalDateTime now = LocalDateTime.now();
        PasswordResetOtp otp = otps.findByEmailForUpdate(email).orElse(null);
        boolean sameUser = otp != null && otp.getUserId().equals(user.getId());
        int resendCount = sameUser ? otp.getResendCount() : 0;
        LocalDateTime window = sameUser ? otp.getResendWindowStartedAt() : now;
        if (sameUser && otp.getLastSentAt().plus(LIFETIME).isAfter(now)) {
            return Instant.now().plus(LIFETIME);
        }
        if (!window.plusHours(1).isAfter(now)) { window = now; resendCount = 0; }
        else if (sameUser) resendCount++;
        // Keep the response generic for unknown accounts and throttled requests.
        if (resendCount > MAX_RESENDS) return Instant.now().plus(LIFETIME);

        String code;
        do {
            code = String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
        } while (sameUser && passwords.matches(code, otp.getOtpHash()));
        String hash = passwords.encode(code);
        try {
            send(user, code);
        } catch (MailException failure) {
            log.warn("Could not send password reset OTP for user id {} ({})", user.getId(), failure.getClass().getSimpleName());
            return Instant.now().plus(LIFETIME);
        }

        Instant issued = Instant.now();
        LocalDateTime issuedLocal = LocalDateTime.ofInstant(issued, ZoneId.systemDefault());
        if (otp == null) otp = new PasswordResetOtp();
        otp.setEmail(email);
        otp.setUserId(user.getId());
        otp.setOtpHash(hash);
        otp.setLastSentAt(issuedLocal);
        otp.setExpiresAt(issuedLocal.plus(LIFETIME));
        otp.setResendWindowStartedAt(window);
        otp.setResendCount(resendCount);
        otp.setAttemptCount(0);
        otp.setUsedAt(null);
        actions.cancelPasswordReset(user.getId());
        otps.save(otp);
        return issued.plus(LIFETIME);
    }

    @Transactional
    public Verification verify(String rawEmail, String code) {
        String email = normalize(rawEmail);
        User user = lockEligibleUser(email).orElseThrow(PasswordResetOtpService::invalidCode);
        PasswordResetOtp otp = otps.findByEmailForUpdate(email).orElseThrow(PasswordResetOtpService::invalidCode);
        if (!otp.getUserId().equals(user.getId()) || otp.getUsedAt() != null) throw invalidCode();
        if (otp.getAttemptCount() >= MAX_ATTEMPTS) return new Verification(null, 0);
        if (!otp.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new ResponseStatusException(HttpStatus.GONE, "Mã đã hết hạn. Vui lòng yêu cầu mã mới.");
        }
        if (code == null || !code.matches("[0-9]{6}") || !passwords.matches(code, otp.getOtpHash())) {
            otp.setAttemptCount(otp.getAttemptCount() + 1);
            otps.save(otp);
            // Return the failure so its counter commits before the controller returns HTTP 400/429.
            return new Verification(null, MAX_ATTEMPTS - otp.getAttemptCount());
        }
        otp.setUsedAt(LocalDateTime.now());
        otps.save(otp);
        return new Verification(actions.issuePasswordResetGrant(user), MAX_ATTEMPTS - otp.getAttemptCount());
    }

    private Optional<User> lockEligibleUser(String email) {
        return users.findByEmailIgnoreCase(email)
                .flatMap(user -> users.findByIdForUpdate(user.getId()))
                .filter(user -> "ACTIVE".equals(user.getStatus()) && user.isEmailVerified()
                        && email.equalsIgnoreCase(user.getEmail()));
    }

    private void send(User user, String code) {
        if (fromAddress == null || fromAddress.isBlank()) throw new MailSendException("SMTP sender address is not configured");
        var message = new SimpleMailMessage();
        message.setFrom(fromAddress);
        message.setTo(user.getEmail());
        message.setSubject("Mã OTP đặt lại mật khẩu Sportiva");
        message.setText("Xin chào " + user.getFullName() + ",\n\nMã OTP đặt lại mật khẩu của bạn là: " + code
                + "\n\nMã chỉ dùng một lần, có hiệu lực trong 1 phút. Nhập sai 5 lần phải yêu cầu mã mới."
                + "\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.");
        mail.send(message);
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã không hợp lệ hoặc yêu cầu không còn hiệu lực. Hãy yêu cầu mã mới.");
    }
}
