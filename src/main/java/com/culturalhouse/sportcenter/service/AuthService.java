package com.culturalhouse.sportcenter.service;

import com.culturalhouse.sportcenter.config.JwtProvider;
import com.culturalhouse.sportcenter.dto.AuthResponse;
import com.culturalhouse.sportcenter.dto.LoginRequest;
import com.culturalhouse.sportcenter.dto.RegisterRequest;
import com.culturalhouse.sportcenter.entity.Role;
import com.culturalhouse.sportcenter.entity.User;
import com.culturalhouse.sportcenter.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    public String register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new IllegalArgumentException("Tên đăng nhập đã tồn tại!");
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email đã được sử dụng!");
        }

        Role requestedRole = request.getRole();
        if (requestedRole == Role.CENTER_MANAGER) {
            throw new IllegalArgumentException("Center manager accounts cannot be created through public registration!");
        }

        User user = User.builder()
                .username(request.getUsername().trim())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName().trim())
                .email(request.getEmail().trim().toLowerCase())
                .phone(request.getPhone())
                .role(requestedRole != null ? requestedRole : Role.MEMBER)
                .build();

        userRepository.save(user);
        return "Đăng ký tài khoản thành công!";
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("Tên đăng nhập hoặc mật khẩu không đúng!"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("Tên đăng nhập hoặc mật khẩu không đúng!");
        }

        String token = jwtProvider.generateToken(user.getUsername(), user.getRole().name());

        return AuthResponse.builder()
                .token(token)
                .username(user.getUsername())
                .role(user.getRole().name())
                .build();
    }
}
