package com.sportscenter.management.service;

import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PasswordResetOtpServiceTest {
    private final PasswordResetOtpRepository otps = mock(PasswordResetOtpRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AccountActionTokenRepository tokens = mock(AccountActionTokenRepository.class);
    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private final AccountActionService actions = new AccountActionService(tokens, users, mail, passwords, mock(AuditLogService.class));
    private final PasswordResetOtpService service = new PasswordResetOtpService(otps, users, passwords, mail, actions);
    private final User user = User.builder().id(7).email("member@example.com").fullName("Member Demo")
            .emailVerified(true).status("ACTIVE").passwordHash("old-password-hash").build();
    private final List<SimpleMailMessage> messages = new ArrayList<>();
    private final List<AccountActionToken> grants = new ArrayList<>();
    private PasswordResetOtp stored;

    @BeforeEach void setup() {
        ReflectionTestUtils.setField(service, "fromAddress", "sender@example.com");
        when(users.findByEmailIgnoreCase(user.getEmail())).thenReturn(Optional.of(user));
        when(users.findByIdForUpdate(7)).thenReturn(Optional.of(user));
        when(otps.findByEmailForUpdate(user.getEmail())).thenAnswer(call -> Optional.ofNullable(stored));
        when(otps.save(any())).thenAnswer(call -> stored = call.getArgument(0));
        when(tokens.save(any())).thenAnswer(call -> { var token = call.getArgument(0, AccountActionToken.class); grants.add(token); return token; });
        when(tokens.findByUserIdAndPurposeAndUsedAtIsNull(eq(7), eq(AccountActionToken.Purpose.RESET_PASSWORD)))
                .thenAnswer(call -> grants.stream().filter(token -> token.getUsedAt() == null).toList());
        when(tokens.findByTokenHashAndPurposeAndUsedAtIsNull(anyString(), eq(AccountActionToken.Purpose.RESET_PASSWORD)))
                .thenAnswer(call -> usable(call.getArgument(0)));
        when(tokens.findUsableForUpdate(anyString(), eq(AccountActionToken.Purpose.RESET_PASSWORD)))
                .thenAnswer(call -> usable(call.getArgument(0)));
        doAnswer(call -> { messages.add(new SimpleMailMessage(call.getArgument(0, SimpleMailMessage.class))); return null; })
                .when(mail).send(any(SimpleMailMessage.class));
    }

    private Optional<AccountActionToken> usable(String hash) {
        return grants.stream().filter(token -> token.getTokenHash().equals(hash) && token.getUsedAt() == null).findFirst();
    }

    private String issueCode() {
        service.requestCode(" MEMBER@example.com ");
        var matcher = Pattern.compile("\\b[0-9]{6}\\b").matcher(messages.getLast().getText());
        assertTrue(matcher.find());
        return matcher.group();
    }

    private String wrongCode(String code) { return code.equals("111111") ? "222222" : "111111"; }

    @Test void storesOnlyAHashAndDoesNotChangePasswordBeforeVerification() {
        String code = issueCode();
        assertTrue(passwords.matches(code, stored.getOtpHash()));
        assertNotEquals(code, stored.getOtpHash());
        assertEquals("Mã OTP đặt lại mật khẩu Sportiva", messages.getFirst().getSubject());
        assertArrayEquals(new String[]{user.getEmail()}, messages.getFirst().getTo());
        assertTrue(stored.getExpiresAt().isAfter(LocalDateTime.now().plusSeconds(55)));
        assertTrue(stored.getExpiresAt().isBefore(LocalDateTime.now().plusSeconds(65)));
        assertTrue(grants.isEmpty());
        verify(users, never()).save(any());
    }

    @Test void fourWrongCodesThenCorrectFifthAttemptAreAccepted() {
        String code = issueCode();
        for (int i = 1; i <= 4; i++) {
            var result = service.verify(user.getEmail(), wrongCode(code));
            assertNull(result.grant());
            assertEquals(5 - i, result.attemptsRemaining());
        }
        var fifth = service.verify(user.getEmail(), code);
        assertNotNull(fifth.grant());
        assertEquals(4, stored.getAttemptCount());
        assertNotNull(stored.getUsedAt());
        assertEquals(1, grants.size());
        assertEquals(AccountActionToken.Purpose.RESET_PASSWORD, grants.getFirst().getPurpose());
        assertNotEquals(fifth.grant().token(), grants.getFirst().getTokenHash());
        assertEquals("old-password-hash", user.getPasswordHash());
    }

    @Test void fiveWrongAttemptsBlockEvenTheCorrectCode() {
        String code = issueCode();
        for (int i = 0; i < 5; i++) assertNull(service.verify(user.getEmail(), wrongCode(code)).grant());
        assertEquals(5, stored.getAttemptCount());
        var freshService = new PasswordResetOtpService(otps, users, passwords, mail, actions);
        var sixth = freshService.verify(user.getEmail(), code);
        assertNull(sixth.grant());
        assertEquals(0, sixth.attemptsRemaining());
        assertTrue(grants.isEmpty());
        verify(users, never()).save(any());
    }

    @Test void requestingNewCodeResetsAttemptsAndRejectsTheOldCode() {
        String old = issueCode();
        for (int i = 0; i < 5; i++) service.verify(user.getEmail(), wrongCode(old));
        stored.setLastSentAt(LocalDateTime.now().minusMinutes(2));
        stored.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        String fresh = issueCode();
        assertNotEquals(old, fresh);
        assertEquals(0, stored.getAttemptCount());
        assertNull(stored.getUsedAt());
        assertNull(service.verify(user.getEmail(), old).grant());
        assertNotNull(service.verify(user.getEmail(), fresh).grant());
    }

    @Test void expiredAndUsedCodesCannotAuthorizeReset() {
        String code = issueCode();
        stored.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        assertEquals(410, assertThrows(ResponseStatusException.class, () -> service.verify(user.getEmail(), code)).getStatusCode().value());
        stored.setExpiresAt(LocalDateTime.now().plusMinutes(1));
        service.verify(user.getEmail(), code);
        assertThrows(ResponseStatusException.class, () -> service.verify(user.getEmail(), code));
        assertEquals(1, grants.size());
    }

    @Test void grantChangesPasswordOnceAndIsNotTheSixDigitCode() throws Exception {
        String code = issueCode();
        assertThrows(IllegalArgumentException.class, () -> actions.resetPassword(code, "new-password"));
        String grant = service.verify(user.getEmail(), code).grant().token();
        assertFalse(grant.matches("[0-9]{6}"));
        assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(grant.getBytes(StandardCharsets.UTF_8))), grants.getFirst().getTokenHash());
        actions.resetPassword(grant, "new-password");
        assertTrue(passwords.matches("new-password", user.getPasswordHash()));
        assertThrows(IllegalArgumentException.class, () -> actions.resetPassword(grant, "another-password"));
        assertTrue(passwords.matches("new-password", user.getPasswordHash()));
    }

    @Test void requestingAnotherOtpRevokesAPreviouslyVerifiedResetGrant() {
        String code = issueCode();
        String grant = service.verify(user.getEmail(), code).grant().token();
        stored.setLastSentAt(LocalDateTime.now().minusMinutes(2));
        String freshCode = issueCode();
        assertThrows(IllegalArgumentException.class, () -> actions.resetPassword(grant, "new-password"));
        assertNotNull(service.verify(user.getEmail(), freshCode).grant());
    }

    @Test void unknownInactiveAndUnverifiedAccountsDoNotSendMail() {
        service.requestCode("missing@example.com");
        user.setStatus("INACTIVE");
        service.requestCode(user.getEmail());
        user.setStatus("ACTIVE");
        user.setEmailVerified(false);
        service.requestCode(user.getEmail());
        assertTrue(messages.isEmpty());
        verify(otps, never()).save(any());
        assertTrue(grants.isEmpty());
    }

    @Test void cooldownAndHourlyLimitDoNotSendExtraCodesOrResetAttempts() {
        String code = issueCode();
        service.verify(user.getEmail(), wrongCode(code));
        service.requestCode(user.getEmail());
        assertEquals(1, messages.size());
        assertEquals(1, stored.getAttemptCount());
        stored.setLastSentAt(LocalDateTime.now().minusMinutes(2));
        stored.setResendCount(5);
        service.requestCode(user.getEmail());
        assertEquals(1, messages.size());
        assertEquals(1, stored.getAttemptCount());
    }

    @Test void smtpFailureDoesNotSaveAnUnsentCodeOrChangePassword() {
        doThrow(new MailSendException("test failure")).when(mail).send(any(SimpleMailMessage.class));
        assertDoesNotThrow(() -> service.requestCode(user.getEmail()));
        verify(otps, never()).save(any());
        verify(users, never()).save(any());
        assertTrue(grants.isEmpty());
    }
}
