package com.sportscenter.management.payment;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/** Bí mật chỉ đọc từ biến môi trường backend, tuyệt đối không đưa xuống FE hoặc log. */
@Component
@ConfigurationProperties(prefix = "membership.payment")
@Getter
@Setter
// TẠO MỚI: PaymentIntegrationProperties — Đọc cấu hình webhook/demo từ biến môi trường BE; mặc định tắt, không hardcode khóa thật.
public class PaymentIntegrationProperties {
    private boolean webhookEnabled;
    private String sepayApiKey = "";
    /** Chỉ bật ở môi trường demo được phép. Giá gói niêm yết không bị sửa theo số tiền thử chuyển. */
    private boolean demoPaymentsEnabled;
    private java.util.Map<Integer, java.math.BigDecimal> demoAmounts = new java.util.HashMap<>(java.util.Map.of(
            1, new java.math.BigDecimal("5000"), 2, new java.math.BigDecimal("6000"), 3, new java.math.BigDecimal("7000")));
    public boolean demoFor(Integer packageId) { return demoPaymentsEnabled && demoAmounts.containsKey(packageId); }
    public java.math.BigDecimal qrAmount(Integer packageId, java.math.BigDecimal catalogPrice) {
        if (!demoFor(packageId)) return catalogPrice;
        java.math.BigDecimal amount = demoAmounts.get(packageId);
        if (amount == null || java.util.stream.Stream.of("5000", "6000", "7000").map(java.math.BigDecimal::new)
                .noneMatch(v -> v.compareTo(amount) == 0))
            throw new IllegalStateException("Số tiền demo QR chỉ được cấu hình 5000, 6000 hoặc 7000 VND.");
        return amount;
    }

    public boolean ready() {
        return webhookEnabled && sepayApiKey != null && sepayApiKey.length() >= 32;
    }
}
