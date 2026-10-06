package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.RegisterRequest;
import com.sportscenter.management.dto.Response.UserResponse;
import com.sportscenter.management.entity.User;

import java.util.List;
import java.util.Optional;

public interface UserService {

    UserResponse registerUser(RegisterRequest request);

    Optional<UserResponse> getUserById(Integer userId);

    Optional<User> getUserByEmail(String email);

    List<UserResponse> getAllUsers(Integer roleId);

    UserResponse updateUserStatus(Integer userId, String status);

    Optional<User> authenticate(String email, String password);

    boolean existsByEmail(String email);
}
