package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.entity.PendingMemberRegistration;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.PendingMemberRegistrationRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Locale;

/** Public member signup: retain only temporary data until the email OTP is confirmed. */
@Service
@RequiredArgsConstructor
public class MemberRegistrationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration CODE_LIFETIME = Duration.ofMinutes(10);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final Duration RESEND_WINDOW = Duration.ofHours(1);
    private static final int MAX_VERIFY_ATTEMPTS = 5;
    private static final int MAX_RESENDS_PER_WINDOW = 5;

    private final PendingMemberRegistrationRepository pendingRegistrations;
    private final UserRepository users;
    private final RoleRepository roles;
    private final PasswordEncoder passwordEncoder;
    private final AccountActionService accountActions;

    @Transactional
    public void start(RegisterRequest request) {
        validate(request);
        String email = normalizeEmail(request.getEmail());
        LocalDateTime now = LocalDateTime.now();

        if (users.existsByEmail(email)
                || users.existsByEmailIgnoreCaseAndIdNot(email, -1)
                || users.existsByPendingEmailIgnoreCaseAndIdNot(email, -1)) {
            throw new IllegalArgumentException("Email đã được sử dụng.");
        }
        PendingMemberRegistration pending = pendingRegistrations.findByEmailIgnoreCaseForUpdate(email)
                .orElse(null);
        if (pending != null && pending.getExpiresAt().isAfter(now)) {
            // Repeated signup does not replace the password/profile awaiting the email owner's approval.
            issueIfAllowed(pending, now);
            return;
        }
        if (users.existsByPhone(request.getPhone().trim())) {
            throw new IllegalArgumentException("Số điện thoại đã được sử dụng.");
        }
        if (pendingRegistrations.existsByPhoneAndEmailNotAndExpiresAtAfter(
                request.getPhone().trim(), email, now)) {
            throw new IllegalArgumentException("Số điện thoại đang được dùng trong một yêu cầu đăng ký khác.");
        }

        boolean firstRequest = pending == null;
        if (firstRequest) pending = PendingMemberRegistration.builder()
                .email(email)
                .createdAt(now)
                .resendWindowStartedAt(now)
                .resendCount(0)
                .build();
        pending.setEmail(email);
        pending.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        pending.setFullName(request.getFullName().trim());
        pending.setPhone(request.getPhone().trim());
        pending.setAttemptCount(0);
        if (!firstRequest) {
            // An expired request can be corrected, but resend limits still apply.
            pendingRegistrations.save(pending);
            issueIfAllowed(pending, now);
            return;
        }

        String code = newCode();
        pending.setOtpHash(passwordEncoder.encode(code));
        pending.setExpiresAt(now.plus(CODE_LIFETIME));
        pending.setLastSentAt(now);
        pendingRegistrations.save(pending);
        accountActions.sendMemberRegistrationCode(pending.getFullName(), email, code, CODE_LIFETIME);
    }

    /** Returns false for missing, expired, exhausted, or incorrect codes. */
    @Transactional
    public boolean verify(String rawEmail, String code) {
        String email = normalizeEmail(rawEmail);
        LocalDateTime now = LocalDateTime.now();
        PendingMemberRegistration pending = pendingRegistrations.findByEmailIgnoreCaseForUpdate(email)
                .orElse(null);
        if (pending == null || !pending.getExpiresAt().isAfter(now)
                || pending.getAttemptCount() >= MAX_VERIFY_ATTEMPTS) {
            return false;
        }
        if (!passwordEncoder.matches(code, pending.getOtpHash())) {
            pending.setAttemptCount(pending.getAttemptCount() + 1);
            pendingRegistrations.save(pending);
            return false;
        }

        // Recheck uniqueness in the same transaction before creating the real account.
        if (users.existsByEmail(email)
                || users.existsByEmailIgnoreCaseAndIdNot(email, -1)
                || users.existsByPendingEmailIgnoreCaseAndIdNot(email, -1)) {
            pendingRegistrations.delete(pending);
            return false;
        }
        if (users.existsByPhone(pending.getPhone())) {
            pendingRegistrations.delete(pending);
            return false;
        }

        Role memberRole = roles.findByRoleName("MEMBER")
                .orElseThrow(() -> new IllegalStateException("Role MEMBER chưa được cấu hình."));
        users.save(User.builder()
                .email(email)
                .passwordHash(pending.getPasswordHash())
                .fullName(pending.getFullName())
                .phone(pending.getPhone())
                .role(memberRole)
                .status("ACTIVE")
                .emailVerified(true)
                .createdAt(now)
                .build());
        pendingRegistrations.delete(pending);
        return true;
    }

    @Transactional
    public void resend(String rawEmail) {
        String email = normalizeEmail(rawEmail);
        PendingMemberRegistration pending = pendingRegistrations.findByEmailIgnoreCaseForUpdate(email)
                .orElse(null);
        if (pending == null) return;
        issueIfAllowed(pending, LocalDateTime.now());
    }

    private void issueIfAllowed(PendingMemberRegistration pending, LocalDateTime now) {
        if (pending.getLastSentAt() != null
                && pending.getLastSentAt().isAfter(now.minus(RESEND_COOLDOWN))) {
            return;
        }
        LocalDateTime windowStart = pending.getResendWindowStartedAt();
        int resendCount = pending.getResendCount();
        if (windowStart == null || !windowStart.isAfter(now.minus(RESEND_WINDOW))) {
            windowStart = now;
            resendCount = 0;
        }
        if (resendCount >= MAX_RESENDS_PER_WINDOW) return;

        String code = newCode();
        pending.setOtpHash(passwordEncoder.encode(code));
        pending.setExpiresAt(now.plus(CODE_LIFETIME));
        pending.setLastSentAt(now);
        pending.setAttemptCount(0);
        pending.setResendWindowStartedAt(windowStart);
        pending.setResendCount(resendCount + 1);
        pendingRegistrations.save(pending);
        accountActions.sendMemberRegistrationCode(
                pending.getFullName(), pending.getEmail(), code, CODE_LIFETIME);
    }

    private void validate(RegisterRequest request) {
        if (request == null || request.getEmail() == null || request.getPassword() == null
                || request.getFullName() == null || request.getPhone() == null) {
            throw new IllegalArgumentException("Vui lòng nhập đầy đủ thông tin đăng ký.");
        }
        String email = normalizeEmail(request.getEmail());
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.com$") || email.length() > 255) {
            throw new IllegalArgumentException("Email phải đúng định dạng và kết thúc bằng .com viết thường.");
        }
        if (request.getPassword().length() < 6 || request.getPassword().length() > 128) {
            throw new IllegalArgumentException("Mật khẩu phải có từ 6 đến 128 ký tự.");
        }
        String fullName = request.getFullName().trim();
        if (fullName.length() < 2 || fullName.length() > 100) {
            throw new IllegalArgumentException("Họ và tên phải có từ 2 đến 100 ký tự.");
        }
        String phone = request.getPhone().trim();
        if (!phone.matches("[+0-9 ()-]{9,20}")) {
            throw new IllegalArgumentException("Số điện thoại không đúng định dạng.");
        }
    }

    private static String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String newCode() {
        return String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
    }

    @Scheduled(fixedDelayString = "${app.registration-otp.cleanup-delay-ms:900000}")
    @Transactional
    public void removeExpiredRegistrations() {
        pendingRegistrations.deleteByExpiresAtBefore(LocalDateTime.now());
    }
}
