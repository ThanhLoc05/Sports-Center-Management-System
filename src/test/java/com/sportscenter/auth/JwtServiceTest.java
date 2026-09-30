package com.sportscenter.auth;

import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.userdetails.User;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {
    private static final String SIGNING_SECRET = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void generatesTokenForUserAndRole() {
        JwtService jwtService = new JwtService(SIGNING_SECRET, 60_000);
        var user = User.withUsername("coach@example.com").password("hashed").roles("COACH").build();

        String token = jwtService.generateToken(user);

        assertEquals("coach@example.com", jwtService.extractUsername(token));
        assertTrue(jwtService.isTokenValid(token, user));
    }

    @Test
    void rejectsTokenSignedWithDifferentSecret() {
        JwtService issuer = new JwtService(SIGNING_SECRET, 60_000);
        String otherSecret = Base64.getEncoder().encodeToString(new byte[]{1, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0});
        JwtService verifier = new JwtService(otherSecret, 60_000);
        var user = User.withUsername("member@example.com").password("hashed").roles("MEMBER").build();

        String token = issuer.generateToken(user);

        assertThrows(JwtException.class, () -> verifier.extractUsername(token));
        assertFalse(issuer.isTokenValid(token, User.withUsername("other@example.com")
                .password("hashed").roles("MEMBER").build()));
    }

    @Test
    void rejectsNonPositiveExpiration() {
        assertThrows(IllegalArgumentException.class, () -> new JwtService(SIGNING_SECRET, 0));
    }
}
