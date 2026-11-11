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
    void refreshRequiresOriginalSessionToMatchCurrentCredential() {
        JwtService jwt = new JwtService(SIGNING_SECRET, 60_000);
        var original = User.withUsername("member@example.com").password("old-placeholder").roles("MEMBER").build();
        var current = User.withUsername("member@example.com").password("new-placeholder").roles("MEMBER").build();
        assertTrue(jwt.refreshToken(jwt.generateToken(original), current).isEmpty());
        String valid = jwt.generateToken(current);
        assertTrue(jwt.isTokenValid(jwt.refreshToken(valid, current).orElseThrow(), current));
        assertTrue(jwt.refreshToken(null, current).isEmpty());
        assertTrue(jwt.refreshToken("malformed", current).isEmpty());
    }

    @Test
    void refreshSnapshotCannotSurviveLaterPasswordRotation() {
        JwtService jwt = new JwtService(SIGNING_SECRET, 60_000);
        var before = User.withUsername("member@example.com").password("old-placeholder").roles("MEMBER").build();
        var after = User.withUsername("member@example.com").password("new-placeholder").roles("MEMBER").build();
        String replacement = jwt.refreshToken(jwt.generateToken(before), before).orElseThrow();
        assertFalse(jwt.isTokenValid(replacement, after));
    }

    @Test
    void refreshRejectsExpiredOriginalAndDisabledAccount() {
        JwtService jwt = new JwtService(SIGNING_SECRET, 60_000);
        var user = User.withUsername("member@example.com").password("encoded-placeholder").roles("MEMBER").build();
        String valid = jwt.generateToken(user);
        var key = io.jsonwebtoken.security.Keys.hmacShaKeyFor(Base64.getDecoder().decode(SIGNING_SECRET));
        var claims = io.jsonwebtoken.Jwts.parser().verifyWith(key).build().parseSignedClaims(valid).getPayload();
        String expired = io.jsonwebtoken.Jwts.builder().claims(claims).expiration(new java.util.Date(0)).signWith(key).compact();
        assertTrue(jwt.refreshToken(expired, user).isEmpty());
        var disabled = User.withUserDetails(user).disabled(true).build();
        assertTrue(jwt.refreshToken(valid, disabled).isEmpty());
    }

    @Test
    void passwordChangeRevokesPreviouslyIssuedTokenWithoutDatabaseSchemaChange() {
        JwtService jwt = new JwtService(SIGNING_SECRET, 60_000);
        var old = User.withUsername("member@example.com").password("old-encoded-placeholder").roles("MEMBER").build();
        var updated = User.withUsername("member@example.com").password("new-encoded-placeholder").roles("MEMBER").build();
        String token = jwt.generateToken(old);
        assertFalse(jwt.isTokenValid(token, updated));
        assertTrue(jwt.isTokenValid(jwt.generateToken(updated), updated));
    }

    @Test
    void legacyTokenWithoutCredentialStampRequiresLoginAgain() {
        JwtService jwt = new JwtService(SIGNING_SECRET, 60_000);
        var user = User.withUsername("member@example.com").password("encoded-placeholder").roles("MEMBER").build();
        String legacy = io.jsonwebtoken.Jwts.builder().subject(user.getUsername())
                .expiration(new java.util.Date(System.currentTimeMillis() + 60_000))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(Base64.getDecoder().decode(SIGNING_SECRET))).compact();
        assertFalse(jwt.isTokenValid(legacy, user));
    }

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
