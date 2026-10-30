package com.sportscenter.management.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleInvalidRequest(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("message", exception.getMessage()));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatusException(ResponseStatusException exception) {
        String message = exception.getReason() == null ? "Yêu cầu không thể xử lý" : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("message", message));
    }

    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleConstraintConflict(
            org.springframework.dao.DataIntegrityViolationException exception) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Yêu cầu bị trùng hoặc dữ liệu vừa được cập nhật. Tải lại rồi thử lại."));
    }

    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidationException(
            org.springframework.web.bind.MethodArgumentNotValidException exception) {
        String errorMsg = exception.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .findFirst()
                .orElse("Dữ liệu không hợp lệ");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(Map.of("message", errorMsg));
    }
}
