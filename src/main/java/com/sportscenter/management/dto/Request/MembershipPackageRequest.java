package com.sportscenter.management.dto.Request;

import lombok.*;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MembershipPackageRequest {

    @NotBlank(message = "Tên gói hội viên không được để trống")
    private String packageName;

    @Positive(message = "Thời hạn gói phải lớn hơn 0")
    private Integer durationDays;

    @NotNull(message = "Giá gói là bắt buộc")
    @DecimalMin(value = "0.00", message = "Giá gói không được âm")
    private BigDecimal price;

    @Pattern(regexp = "(?i)STANDARD|VIP", message = "Cấp gói chỉ được là STANDARD hoặc VIP")
    private String accessLevel;

    private String description;

    @Pattern(regexp = "(?i)ACTIVE|INACTIVE", message = "Trạng thái gói không hợp lệ")
    private String status;
}
