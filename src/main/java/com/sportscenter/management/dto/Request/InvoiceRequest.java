package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceRequest {

    @Positive(message = "ID đăng ký gói phải lớn hơn 0")
    private Integer subscriptionId;

    @NotNull(message = "Thành viên là bắt buộc")
    @Positive(message = "ID thành viên phải lớn hơn 0")
    private Integer memberId;

    @NotNull(message = "Số tiền là bắt buộc")
    @DecimalMin(value = "0.01", message = "Số tiền phải lớn hơn 0")
    private BigDecimal amount;

    @NotBlank(message = "Phương thức thanh toán là bắt buộc")
    private String paymentMethod;
}