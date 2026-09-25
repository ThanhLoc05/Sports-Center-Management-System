package com.culturalhouse.sportcenter.service;

import com.culturalhouse.sportcenter.config.JwtProvider;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private final JwtProvider jwtProvider;

    public JwtService(JwtProvider jwtProvider) {
        this.jwtProvider = jwtProvider;
    }

    public String extractUsername(String token) {
        return jwtProvider.getUsernameFromToken(token);
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return username != null
                && username.equals(userDetails.getUsername())
                && jwtProvider.validateToken(token);
    }
}