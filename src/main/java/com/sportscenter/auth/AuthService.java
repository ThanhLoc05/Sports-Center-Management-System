package com.sportscenter.auth;

import com.sportscenter.auth.dto.MemberRegistration;
import com.sportscenter.user.UserService;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
public class AuthService {
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserService users;

    public AuthService(AuthenticationManager authenticationManager, JwtService jwtService,
                       UserService users) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.users = users;
    }

    public LoginResult login(String email, String password) {
        UserDetails user = (UserDetails) authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, password)).getPrincipal();
        assert user != null;
        return new LoginResult(jwtService.generateToken(user), jwtService.getExpirationMillis(),
                users.currentUser(user.getUsername()));
    }

    public Map<String, Object> currentUser(UserDetails user) {
        return users.currentUser(user.getUsername());
    }

    @Transactional
    public Map<String, Object> register(MemberRegistration request) {
        return users.registerMember(request.email(), request.password(), request.fullName(),
                request.phone(), request.dateOfBirth(), request.gender(), request.address(),
                request.fitnessGoal(), request.emergencyContact());
    }

    public record LoginResult(String accessToken, long expiresInMillis, Map<String, Object> user) {
    }
}
