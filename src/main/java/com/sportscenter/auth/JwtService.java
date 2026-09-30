package com.sportscenter.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;

@Service
public class JwtService {
    private final SecretKey signingKey;
    @Getter
    private final long expirationMillis;

    public JwtService(@Value("${app.jwt.secret}") String base64Secret,
                      @Value("${app.jwt.expiration:900000}") long expirationMillis) {
        if (expirationMillis <= 0) {
            throw new IllegalArgumentException("JWT expiration must be positive.");
        }
        try {
            this.signingKey = Keys.hmacShaKeyFor(Decoders.BASE64.decode(base64Secret));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT_SECRET must be Base64-encoded and contain at least 32 bytes.", exception);
        }
        this.expirationMillis = expirationMillis;
    }

    public String generateToken(UserDetails user) {
        Instant issuedAt = Instant.now();
        List<String> roles = user.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList();
        return Jwts.builder()
                .subject(user.getUsername())
                .claim("roles", roles)
                .issuedAt(Date.from(issuedAt))
                .expiration(Date.from(issuedAt.plusMillis(expirationMillis)))
                .signWith(signingKey)
                .compact();
    }

    public String extractUsername(String token) {
        return claims(token).getSubject();
    }

    public boolean isTokenValid(String token, UserDetails user) {
        Claims tokenClaims = claims(token);
        Date expiration = tokenClaims.getExpiration();
        return user.getUsername().equals(tokenClaims.getSubject())
                && expiration != null
                && expiration.after(new Date())
                && user.isEnabled();
    }

    private Claims claims(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
