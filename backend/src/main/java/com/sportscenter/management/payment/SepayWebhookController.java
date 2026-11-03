package com.sportscenter.management.payment;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** Nhà cung cấp gọi bằng API key, không dùng JWT của member/lễ tân. Không ghi token/payload nhạy cảm vào log. */
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/payments/webhooks/sepay")
// TẠO MỚI: SepayWebhookController — Điểm nhận POST từ SePay; tự kiểm tra API key trước khi giao service đối soát, không dùng JWT của thành viên.
public class SepayWebhookController {
    private final SepayWebhookService service;
    @PostMapping
    public Map<String, Boolean> receive(@RequestHeader(name = "Authorization", required = false) String authorization,
                                        @Valid @RequestBody SepayWebhookRequest input) {
        service.authenticate(authorization);
        service.accept(input);
        // SePay yêu cầu HTTP 200/201 và {success:true}; giao dịch không thuộc hệ thống được bỏ qua an toàn.
        return Map.of("success", true);
    }
}
