package com.sportscenter.management.service;

import com.sportscenter.management.entity.AccountActionToken;
import com.sportscenter.management.entity.AccountActionToken.Purpose;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.AccountActionTokenRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccountActionServiceTest {
    private final AccountActionTokenRepository tokens = mock(AccountActionTokenRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final AccountActionService service =
            new AccountActionService(tokens, users, mail, passwords, audit);

    @BeforeEach void configureMockOnlyMail() {
        ReflectionTestUtils.setField(service, "frontendBaseUrl", "https://frontend.example.test");
    }

    @Test
    void verificationAppliesPendingEmailOnlyWhenTokenTargetMatches() {
        User user = User.builder().id(10).email("old@example.test")
                .pendingEmail("new@example.test").emailVerified(true).status("ACTIVE")
                .role(Role.builder().roleName("MEMBER").build()).build();
        AccountActionToken token = token(Purpose.VERIFY_EMAIL, "new@example.test");
        when(tokens.findUsableForUpdate(anyString(), eq(Purpose.VERIFY_EMAIL)))
                .thenReturn(Optional.of(token));
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));

        service.verifyEmail("raw-token");

        assertEquals("new@example.test", user.getEmail());
        assertNull(user.getPendingEmail());
        assertTrue(user.isEmailVerified());
        assertNotNull(token.getUsedAt());
        verify(users).save(user);
        verify(audit).recordEmailVerification(user);
    }

    @Test
    void staleEmailChangeTokenCannotReplaceCurrentPendingAddress() {
        User user = User.builder().id(10).email("old@example.test")
                .pendingEmail("newer@example.test").emailVerified(true).status("ACTIVE")
                .role(Role.builder().roleName("MEMBER").build()).build();
        when(tokens.findUsableForUpdate(anyString(), eq(Purpose.VERIFY_EMAIL)))
                .thenReturn(Optional.of(token(Purpose.VERIFY_EMAIL, "older@example.test")));
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));

        assertThrows(IllegalArgumentException.class, () -> service.verifyEmail("raw-token"));
        verify(users, never()).save(any());
    }

    @Test
    void signupTokenVerifiesOnlyAnUnverifiedMember() {
        User user = User.builder().id(10).email("member@example.test")
                .emailVerified(false).status("ACTIVE")
                .role(Role.builder().roleName("MEMBER").build()).build();
        AccountActionToken token = token(Purpose.VERIFY_EMAIL, user.getEmail());
        when(tokens.findUsableForUpdate(anyString(), eq(Purpose.VERIFY_EMAIL)))
                .thenReturn(Optional.of(token));
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));

        service.verifyEmail("raw-token");

        assertTrue(user.isEmailVerified());
        verify(users).save(user);
    }

    @Test
    void resetTokenChangesPasswordAndInvalidatesItAfterUse() {
        User user = User.builder().id(10).email("member@example.test").status("ACTIVE").build();
        AccountActionToken token = token(Purpose.RESET_PASSWORD, user.getEmail());
        when(tokens.findUsableForUpdate(anyString(), eq(Purpose.RESET_PASSWORD)))
                .thenReturn(Optional.of(token));
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));
        when(passwords.encode("new-password")).thenReturn("hashed-password");

        service.resetPassword("raw-token", "new-password");

        assertEquals("hashed-password", user.getPasswordHash());
        assertNotNull(token.getUsedAt());
        verify(users).save(user);
    }

    private static AccountActionToken token(Purpose purpose, String targetEmail) {
        return AccountActionToken.builder().id(5L).userId(10).purpose(purpose)
                .targetEmail(targetEmail).tokenHash("hash")
                .createdAt(LocalDateTime.now().minusMinutes(1))
                .expiresAt(LocalDateTime.now().plusHours(1)).build();
    }

    @Test void issuesHashedExpiringTokenAndSendsOnlyThroughMockMail() {
        var user = User.builder().id(10).email("member@example.test").fullName("Test").build();
        service.sendSignupVerification(user);
        var stored = org.mockito.ArgumentCaptor.forClass(AccountActionToken.class);
        verify(tokens).save(stored.capture());
        var message = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(message.capture());
        String raw = message.getValue().getText().split("token=")[1].split("\\s")[0];
        assertEquals(64, stored.getValue().getTokenHash().length());
        assertNotEquals(raw, stored.getValue().getTokenHash());
        assertTrue(stored.getValue().getExpiresAt().isAfter(LocalDateTime.now().plusHours(23)));
        assertArrayEquals(new String[]{user.getEmail()}, message.getValue().getTo());
    }

    @Test void consumedOrExpiredTokenCannotSaveOrAuditSuccess() {
        var used = token(Purpose.VERIFY_EMAIL, "member@example.test");
        used.setUsedAt(LocalDateTime.now());
        var expired = token(Purpose.VERIFY_EMAIL, "member@example.test");
        expired.setExpiresAt(LocalDateTime.now().minusSeconds(1));
        when(tokens.findUsableForUpdate(anyString(), any())).thenReturn(Optional.of(used), Optional.of(expired));
        assertThrows(IllegalArgumentException.class, () -> service.verifyEmail("test-used"));
        assertThrows(IllegalArgumentException.class, () -> service.verifyEmail("test-expired"));
        verify(users, never()).save(any()); verifyNoInteractions(audit);
    }

    @Test void unknownEmailAndRateLimitedRequestsDoNotExposeAccountOrSendMail() {
        service.requestPasswordReset("missing@example.test");
        service.requestVerification("missing@example.test");
        var user = User.builder().id(10).email("member@example.test").status("ACTIVE").emailVerified(true).build();
        when(users.findByEmailIgnoreCase(user.getEmail())).thenReturn(Optional.of(user));
        when(tokens.countByUserIdAndPurposeAndCreatedAtAfter(eq(10), any(), any())).thenReturn(1L);
        service.requestPasswordReset(user.getEmail());
        verifyNoInteractions(mail); verify(tokens, never()).save(any());
    }

    @Test void smtpFailureOnSignupPropagatesButGenericResetDoesNotExposeIt() {
        var user = User.builder().id(10).email("member@example.test").fullName("Test").status("ACTIVE").emailVerified(true).build();
        doThrow(new MailSendException("private-upstream-detail")).when(mail).send(any(SimpleMailMessage.class));
        assertThrows(MailSendException.class, () -> service.sendSignupVerification(user));
        when(users.findByEmailIgnoreCase(user.getEmail())).thenReturn(Optional.of(user));
        assertDoesNotThrow(() -> service.requestPasswordReset(user.getEmail()));
    }

    @Test void verificationCannotStealAnExistingEmailAndDoesNotAuditFailure() {
        var user=User.builder().id(10).email("old@example.test").pendingEmail("taken@example.test")
                .status("ACTIVE").role(Role.builder().roleName("MEMBER").build()).build();
        when(tokens.findUsableForUpdate(anyString(),eq(Purpose.VERIFY_EMAIL)))
                .thenReturn(Optional.of(token(Purpose.VERIFY_EMAIL,"taken@example.test")));
        when(users.findByIdForUpdate(10)).thenReturn(Optional.of(user));
        when(users.existsByEmailIgnoreCaseAndIdNot("taken@example.test",10)).thenReturn(true);
        assertThrows(IllegalArgumentException.class,()->service.verifyEmail("test-marker"));
        assertEquals("old@example.test",user.getEmail());verifyNoInteractions(audit);verify(users,never()).save(any());
    }
}
