package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** Đăng ký trực tiếp Member để demo: tạo tài khoản xong có thể đăng nhập ngay. */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class PublicRegistrationController {
    private final UserService users;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest input) {
        return users.registerUser(input);
    }
}
