package com.sportscenter.management.service;

import com.sportscenter.management.entity.AccountActionToken;
import com.sportscenter.management.entity.AccountActionToken.Purpose;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.AccountActionTokenRepository;
import com.sportscenter.management.repository.UserRepository;
import org.junit.jupiter.api.Test;
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
    private final AccountActionService service =
            new AccountActionService(tokens, users, mock(JavaMailSender.class), passwords);

    @Test
    void verificationAppliesPendingEmailOnlyWhenTokenTargetMatches() {
        User user = User.builder().id(10).email("old@example.test")
                .pendingEmail("new@example.test").emailVerified(true)
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
    }

    @Test
    void staleEmailChangeTokenCannotReplaceCurrentPendingAddress() {
        User user = User.builder().id(10).email("old@example.test")
                .pendingEmail("newer@example.test").emailVerified(true)
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
                .emailVerified(false)
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
        User user = User.builder().id(10).email("member@example.test").build();
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
}
