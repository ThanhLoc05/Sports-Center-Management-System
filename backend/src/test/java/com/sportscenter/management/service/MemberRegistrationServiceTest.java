package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.entity.PendingMemberRegistration;
import com.sportscenter.management.repository.PendingMemberRegistrationRepository;
import com.sportscenter.management.repository.RoleRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MemberRegistrationServiceTest {
    private static final String EMAIL = "signup@example.com";
    private static final String NAME = "Thanh vien demo";
    private final PendingMemberRegistrationRepository pending = mock(PendingMemberRegistrationRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final MemberRegistrationMailService mail = mock(MemberRegistrationMailService.class);
    private final MemberRegistrationService service = new MemberRegistrationService(
            pending, users, mock(RoleRepository.class), passwords, mail);

    @Test
    void signupAcceptsA72BytePasswordAndSendsACodeWithAOneMinuteDeadline() {
        var encoder = new BCryptPasswordEncoder(4);
        var registrationService = new MemberRegistrationService(
                pending, users, mock(RoleRepository.class), encoder, mail);
        String password = "\u00e1".repeat(36);
        var expiresAt = registrationService.start(RegisterRequest.builder()
                .email(EMAIL).fullName(NAME).phone("0900000098").password(password).build());

        var savedRequest = ArgumentCaptor.forClass(PendingMemberRegistration.class);
        verify(pending).save(savedRequest.capture());
        var registration = savedRequest.getValue();
        assertTrue(encoder.matches(password, registration.getPasswordHash()));
        assertEquals(Duration.ofMinutes(1), Duration.between(registration.getLastSentAt(), registration.getExpiresAt()));
        assertEquals(expiresAt, registration.getExpiresAt().atZone(ZoneId.systemDefault()).toInstant());
        verify(mail).send(eq(NAME), eq(EMAIL), matches("[0-9]{6}"), eq(Duration.ofMinutes(1)));
        verify(users, never()).save(any());
    }

    @Test
    void signupRejectsPasswordsOver72Utf8BytesBeforeCreatingAPendingRequest() {
        for (String password : List.of("x".repeat(73), "\u00e1".repeat(37))) {
            var request = RegisterRequest.builder()
                    .email(EMAIL).fullName(NAME).phone("0900000098").password(password).build();
            var failure = assertThrows(IllegalArgumentException.class, () -> service.start(request));
            assertTrue(failure.getMessage().contains("72 byte"));
        }
        verifyNoInteractions(pending, users, passwords, mail);
    }

    @Test
    void expiredCodeRequiresAnExplicitResendEvenForAnExistingRegistration() {
        var issuedAt = LocalDateTime.now().minusSeconds(65);
        var registration = PendingMemberRegistration.builder()
                .email(EMAIL).fullName(NAME).lastSentAt(issuedAt)
                .expiresAt(issuedAt.plusMinutes(10)).attemptCount(2)
                .resendWindowStartedAt(issuedAt).build();
        when(pending.findByEmailIgnoreCaseForUpdate(EMAIL)).thenReturn(Optional.of(registration));

        var failure = assertThrows(ResponseStatusException.class, () -> service.verify(EMAIL, "123456"));
        assertEquals(HttpStatus.GONE, failure.getStatusCode());
        assertTrue(failure.getReason().contains("Gửi lại mã"));
        verifyNoInteractions(mail, passwords, users);

        when(passwords.encode(anyString())).thenReturn("new-code-hash");
        service.resend(EMAIL);
        assertEquals(0, registration.getAttemptCount());
        assertEquals("new-code-hash", registration.getOtpHash());
        assertEquals(Duration.ofMinutes(1), Duration.between(registration.getLastSentAt(), registration.getExpiresAt()));
        verify(mail).send(eq(NAME), eq(EMAIL), matches("[0-9]{6}"), eq(Duration.ofMinutes(1)));
    }

    @Test
    void cleanupKeepsRecentlyExpiredRequestsAvailableForResend() {
        service.removeExpiredRegistrations();

        var cutoff = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(pending).deleteByExpiresAtBefore(cutoff.capture());
        assertTrue(cutoff.getValue().isBefore(LocalDateTime.now().minusMinutes(59)));
    }
}
