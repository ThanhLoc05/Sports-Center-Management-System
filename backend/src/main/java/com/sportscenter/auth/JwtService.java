package com.sportscenter.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationMillis;

    public JwtService(
            @Value("${security.jwt.secret}") String base64Secret,
            @Value("${security.jwt.expiration-ms}") long expirationMillis) {
        if (expirationMillis <= 0) {
            throw new IllegalArgumentException("JWT expiration must be positive");
        }
        this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(base64Secret));
        this.expirationMillis = expirationMillis;
    }

    public String generateToken(UserDetails userDetails) {
        Instant issuedAt = Instant.now();
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .claim("pwdv", credentialStamp(userDetails))
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(issuedAt.plusMillis(expirationMillis)))
                .signWith(signingKey)
                .compact();
    }

    public String extractUsername(String token) {
        return getClaims(token).getSubject();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        Claims claims = getClaims(token);
        return userDetails.getUsername().equals(claims.getSubject())
                && claims.getExpiration() != null && claims.getExpiration().after(new Date())
                && claims.get("pwdv") instanceof String stamp
                && MessageDigest.isEqual(stamp.getBytes(StandardCharsets.US_ASCII),
                        credentialStamp(userDetails).getBytes(StandardCharsets.US_ASCII));
    }

    /** Validate the original session against the same credential snapshot used to sign its replacement. */
    public Optional<String> refreshToken(String originalToken, UserDetails currentUser) {
        try {
            if (!currentUser.isEnabled() || !isTokenValid(originalToken, currentUser)) return Optional.empty();
            // If a password rotation commits after this read, this snapshot's stamp is revoked too.
            return Optional.of(generateToken(currentUser));
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException invalidSession) {
            return Optional.empty();
        }
    }

    /** Opaque password-bound stamp; never place the password/hash itself in a JWT. */
    private String credentialStamp(UserDetails user) {
        if (user.getPassword() == null || user.getPassword().isBlank())
            throw new IllegalArgumentException("A persisted credential is required to issue or validate a token");
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey.getEncoded(), "HmacSHA256"));
            mac.update("sportiva:credential:v1\0".getBytes(StandardCharsets.UTF_8));
            mac.update(user.getUsername().getBytes(StandardCharsets.UTF_8));
            mac.update((byte) 0);
            return Base64.getUrlEncoder().withoutPadding().encodeToString(
                    mac.doFinal(user.getPassword().getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("Credential stamp is unavailable", failure);
        }
    }

    private Claims getClaims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
