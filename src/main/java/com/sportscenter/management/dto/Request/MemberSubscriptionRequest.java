package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberSubscriptionRequest {

    private Integer memberId;

    @NotNull(message = "Gói hội viên là bắt buộc")
    private Integer packageId;

    @NotNull(message = "Ngày bắt đầu là bắt buộc")
    private LocalDate startDate;
}
