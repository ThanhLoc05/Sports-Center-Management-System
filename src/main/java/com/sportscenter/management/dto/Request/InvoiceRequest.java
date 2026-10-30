package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceRequest {

    private Integer subscriptionId;

    @NotNull(message = "Hội viên là bắt buộc")
    private Integer memberId;

    @Positive(message = "Số tiền phải lớn hơn 0")
    private BigDecimal amount;

    @Pattern(regexp = "(?i)CASH|CREDIT_CARD|BANK_TRANSFER|VNPAY|MOMO|ZALOPAY|PAYOS",
            message = "Phương thức thanh toán không hợp lệ")
    private String paymentMethod;
}
