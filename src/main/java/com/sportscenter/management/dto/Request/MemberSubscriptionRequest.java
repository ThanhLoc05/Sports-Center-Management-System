package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberSubscriptionRequest {

    @NotNull(message = "Thành viên là bắt buộc")
    @Positive(message = "ID thành viên phải lớn hơn 0")
    private Integer memberId;

    @NotNull(message = "Gói tập là bắt buộc")
    @Positive(message = "ID gói tập phải lớn hơn 0")
    private Integer packageId;

    @NotNull(message = "Ngày bắt đầu là bắt buộc")
    private LocalDate startDate;
}