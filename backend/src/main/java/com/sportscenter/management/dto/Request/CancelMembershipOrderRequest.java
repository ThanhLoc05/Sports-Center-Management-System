package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Getter;
import lombok.Setter;

/** Phiên bản đơn đang xem giúp phát hiện thu tiền/hủy đồng thời từ tab khác. */
@Getter
@Setter
public class CancelMembershipOrderRequest {
    @NotNull @PositiveOrZero
    private Integer version;
}
