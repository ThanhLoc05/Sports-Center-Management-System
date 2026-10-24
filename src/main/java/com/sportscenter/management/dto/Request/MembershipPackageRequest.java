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
public class MembershipPackageRequest {

    @NotBlank(message = "Tên gói tập là bắt buộc")
    private String packageName;

    @Positive(message = "Thời hạn gói phải lớn hơn 0")
    private Integer durationDays;

    @NotNull(message = "Giá gói tập là bắt buộc")
    @DecimalMin(value = "0.00", message = "Giá gói tập không được âm")
    private BigDecimal price;

    private String description;

    private String status;
}