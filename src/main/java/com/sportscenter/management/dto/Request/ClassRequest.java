package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassRequest {

    private String className;

    private Integer sportId;

    private Integer coachId;

    private Integer roomId;

    @Positive(message = "Sức chứa phải lớn hơn 0")
    private Integer maxCapacity;

    private LocalDateTime scheduleTime;

    @Positive(message = "Thời lượng phải lớn hơn 0")
    private Integer durationMinutes;

    @Pattern(regexp = "(?i)STANDARD|VIP", message = "Cấp truy cập chỉ được là STANDARD hoặc VIP")
    private String requiredAccessLevel;

    private String status;
}
