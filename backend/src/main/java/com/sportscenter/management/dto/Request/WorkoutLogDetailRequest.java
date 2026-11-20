package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.math.BigDecimal;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkoutLogDetailRequest {

    @NotBlank(message = "Tên bài tập không được để trống")
    private String exerciseName;

    @Positive(message = "Số hiệp phải lớn hơn 0")
    private Integer sets;

    @Positive(message = "Số lần phải lớn hơn 0")
    private Integer reps;

    @DecimalMin(value = "0", message = "Mức tạ không được âm")
    private BigDecimal weightKg;

    @DecimalMin(value = "0", message = "Chỉ số tập luyện không được âm")
    @Digits(integer = 9, fraction = 3, message = "Chỉ số có tối đa 9 chữ số trước dấu thập phân và 3 chữ số sau")
    private BigDecimal metricValue;

    @Pattern(regexp = "seconds|minutes|meters|kilometers|repetitions|rounds|hitsPer20",
            message = "Đơn vị chỉ số tập luyện không hợp lệ")
    private String metricUnit;

    @AssertTrue(message = "Chỉ số tập luyện cần cả giá trị và đơn vị, hoặc dùng số hiệp, số lần và mức tạ")
    public boolean isMetricFormatValid() {
        if (metricValue == null && metricUnit == null) {
            return true;
        }
        return metricValue != null && metricUnit != null && sets == null && reps == null && weightKg == null;
    }

    @AssertTrue(message = "Số lần và số hiệp phải là số nguyên. Số lần trúng trên 20 lượt không được vượt quá 20")
    public boolean isMetricCountValid() {
        if (metricValue == null || metricUnit == null) {
            return true;
        }
        return switch (metricUnit) {
            case "hitsPer20" -> metricValue.stripTrailingZeros().scale() <= 0
                    && metricValue.compareTo(BigDecimal.valueOf(20)) <= 0;
            case "repetitions", "rounds" -> metricValue.stripTrailingZeros().scale() <= 0;
            default -> true;
        };
    }
}
