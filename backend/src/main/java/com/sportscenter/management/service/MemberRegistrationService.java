package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.entity.PendingMemberRegistration;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.PendingMemberRegistrationRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;

/** Public member signup: retain only temporary data until the email OTP is confirmed. */
@Service
@RequiredArgsConstructor
public class MemberRegistrationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Duration CODE_LIFETIME = Duration.ofMinutes(1);
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);
    private static final Duration RESEND_WINDOW = Duration.ofHours(1);
    private static final int MAX_VERIFY_ATTEMPTS = 5;
    private static final int MAX_RESENDS_PER_WINDOW = 5;
    private static final int MAX_PASSWORD_BYTES = 72;

    private final PendingMemberRegistrationRepository pendingRegistrations;
    private final UserRepository users;
    private final RoleRepository roles;
    private final PasswordEncoder passwordEncoder;
    private final MemberRegistrationMailService registrationMail;

    @Transactional
    public Instant start(RegisterRequest request) {
        validate(request);
        String email = normalizeEmail(request.getEmail());
        String phone = request.getPhone().trim();

        if (emailIsInUse(email)) {
            throw new IllegalArgumentException("Email đã được sử dụng.");
        }

        PendingMemberRegistration pending = pendingRegistrations.findByEmailIgnoreCaseForUpdate(email)
                .orElse(null);
        LocalDateTime now = LocalDateTime.now();
        if (pending != null && !codeExpired(pending, now)) {
            // A repeat request can resend the existing OTP, but cannot replace the pending credentials.
            return issueIfAllowed(pending, now);
        }
        if (users.existsByPhone(phone)) {
            throw new IllegalArgumentException("Số điện thoại đã được sử dụng.");
        }
        if (pendingRegistrations.existsByPhoneAndEmailNotAndExpiresAtAfterAndLastSentAtAfter(
                phone, email, now, now.minus(CODE_LIFETIME))) {
            throw new IllegalArgumentException("Số điện thoại đang được dùng trong một yêu cầu đăng ký khác.");
        }

        boolean firstRequest = pending == null;
        if (firstRequest) {
            pending = PendingMemberRegistration.builder()
                    .email(email)
                    .createdAt(now)
                    .resendWindowStartedAt(now)
                    .resendCount(0)
                    .build();
        }
        pending.setEmail(email);
        pending.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        pending.setFullName(request.getFullName().trim());
        pending.setPhone(phone);
        pending.setAttemptCount(0);

        // Expired requests may be corrected; the existing hourly resend limit still applies.
        return firstRequest ? sendNewCode(pending, 0, now) : issueIfAllowed(pending, now);
    }

    /** Returns false for incorrect or exhausted codes and stale signup details. */
    @Transactional
    public boolean verify(String rawEmail, String code) {
        String email = normalizeEmail(rawEmail);
        PendingMemberRegistration pending = requirePendingRegistration(email);
        LocalDateTime now = LocalDateTime.now();
        if (codeExpired(pending, now)) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "Mã xác minh đã hết hạn. Vui lòng bấm Gửi lại mã để nhận mã mới.");
        }
        if (pending.getAttemptCount() >= MAX_VERIFY_ATTEMPTS) {
            return false;
        }
        if (!passwordEncoder.matches(code, pending.getOtpHash())) {
            pending.setAttemptCount(pending.getAttemptCount() + 1);
            pendingRegistrations.save(pending);
            return false;
        }

        // Recheck unique fields at the point of account creation to avoid stale pending data.
        if (emailIsInUse(email) || users.existsByPhone(pending.getPhone())) {
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
    public Instant resend(String rawEmail) {
        PendingMemberRegistration pending = requirePendingRegistration(normalizeEmail(rawEmail));
        return issueIfAllowed(pending, LocalDateTime.now());
    }

    private PendingMemberRegistration requirePendingRegistration(String email) {
        return pendingRegistrations.findByEmailIgnoreCaseForUpdate(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Yêu cầu đăng ký không còn hiệu lực. Vui lòng quay lại đăng ký."));
    }

    private static boolean codeExpired(PendingMemberRegistration pending, LocalDateTime now) {
        // Apply the one minute limit to codes issued before this version as well.
        return !pending.getExpiresAt().isAfter(now)
                || !pending.getLastSentAt().plus(CODE_LIFETIME).isAfter(now);
    }

    private boolean emailIsInUse(String email) {
        return users.existsByEmail(email)
                || users.existsByEmailIgnoreCaseAndIdNot(email, -1)
                || users.existsByPendingEmailIgnoreCaseAndIdNot(email, -1);
    }

    private Instant issueIfAllowed(PendingMemberRegistration pending, LocalDateTime now) {
        LocalDateTime nextAllowedSend = pending.getLastSentAt().plus(RESEND_COOLDOWN);
        if (now.isBefore(nextAllowedSend)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Vui lòng đợi 1 phút trước khi yêu cầu gửi lại mã.");
        }

        LocalDateTime windowStart = pending.getResendWindowStartedAt();
        int resendCount = pending.getResendCount();
        if (windowStart == null || !windowStart.plus(RESEND_WINDOW).isAfter(now)) {
            windowStart = now;
            resendCount = 0;
        }
        if (resendCount >= MAX_RESENDS_PER_WINDOW) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Đã gửi quá số lần cho phép. Vui lòng thử lại sau một giờ.");
        }
        return sendNewCode(pending, resendCount + 1, windowStart);
    }

    private Instant sendNewCode(PendingMemberRegistration pending, int resendCount,
            LocalDateTime windowStart) {
        String code = newCode();
        pending.setOtpHash(passwordEncoder.encode(code));
        Instant issuedAt = Instant.now();
        LocalDateTime issuedAtLocal = LocalDateTime.ofInstant(issuedAt, ZoneId.systemDefault());
        pending.setExpiresAt(issuedAtLocal.plus(CODE_LIFETIME));
        pending.setLastSentAt(issuedAtLocal);
        pending.setAttemptCount(0);
        pending.setResendWindowStartedAt(windowStart);
        pending.setResendCount(resendCount);
        pendingRegistrations.save(pending);
        registrationMail.send(pending.getFullName(), pending.getEmail(), code, CODE_LIFETIME);
        return issuedAt.plus(CODE_LIFETIME);
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
        String password = request.getPassword();
        if (password.length() < 6) {
            throw new IllegalArgumentException("Mật khẩu phải có ít nhất 6 ký tự.");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new IllegalArgumentException("Mật khẩu không được vượt quá 72 byte UTF-8.");
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

    @Scheduled(fixedDelay = 900000)
    @Transactional
    public void removeExpiredRegistrations() {
        // Preserve the pending signup for resends after its OTP expires.
        pendingRegistrations.deleteByExpiresAtBefore(LocalDateTime.now().minus(RESEND_WINDOW));
    }
}
