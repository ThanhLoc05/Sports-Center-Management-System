package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.NotificationSendRequest;
import com.sportscenter.management.dto.Response.NotificationSendResponse;
import com.sportscenter.management.service.NotificationDeliveryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationDeliveryService notificationService;
    private final SecurityUtils securityUtils;

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("isAuthenticated()")
    public SseEmitter subscribe() {
        Integer userId = securityUtils.getCurrentUserId();
        if (userId == null) {
            throw new org.springframework.security.access.AccessDeniedException("Phiên đăng nhập không hợp lệ");
        }
        return notificationService.subscribe(userId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('CENTER_MANAGER', 'COACH')")
    public ResponseEntity<NotificationSendResponse> send(
            @Valid @RequestBody NotificationSendRequest request) {
        return ResponseEntity.accepted().body(notificationService.send(request));
    }
}
