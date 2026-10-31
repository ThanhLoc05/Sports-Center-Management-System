package com.sportscenter.management.payment;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/** Payload theo tài liệu SePay; không nhận trạng thái PAID hay memberId do client tự khai. */
@JsonIgnoreProperties(ignoreUnknown = true)
// TẠO MỚI: SepayWebhookRequest — DTO payload giao dịch ngân hàng; không cho client tự khai trạng thái PAID hoặc người được gia hạn.
public record SepayWebhookRequest(
        @NotNull @PositiveOrZero Long id,
        @NotBlank @Size(max = 100) String gateway,
        @NotBlank @Size(max = 40) String transactionDate,
        @NotBlank @Size(max = 30) String accountNumber,
        @NotBlank @Size(max = 1000) String content,
        @NotBlank @Pattern(regexp = "in|out") String transferType,
        @NotNull @Positive @Digits(integer = 15, fraction = 0) BigDecimal transferAmount,
        @Size(max = 100) String referenceCode) {}
