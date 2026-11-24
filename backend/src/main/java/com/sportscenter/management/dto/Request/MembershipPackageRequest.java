package com.sportscenter.management.dto.Request;

import lombok.*;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;

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

    private Boolean allSports;

    @Positive(message = "Số bộ môn phải lớn hơn 0")
    private Integer sportLimit;

    @Positive(message = "Số lớp đang đăng ký phải lớn hơn 0")
    private Integer maxConcurrentClasses;

    @Min(value = 0, message = "Ưu đãi khóa học không được âm")
    @Max(value = 100, message = "Ưu đãi khóa học không được vượt quá 100%")
    private Integer courseDiscountPercent;

    @Size(max = 255, message = "Mô tả gói không được vượt quá 255 ký tự")
    private String description;

    @Pattern(regexp = "(?i)ACTIVE|INACTIVE", message = "Trạng thái gói không hợp lệ")
    private String status;
}
