package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Getter;

import java.math.BigDecimal;

@Getter
@Builder
public class MembershipOfferResponse {
    private Integer id;
    private String name;
    private BigDecimal price;
    // BỔ SUNG: trả riêng giá niêm yết và khoản thu QR demo để FE hiển thị rõ, không tự suy đoán giá.
    /** Số tiền QR dự kiến khi demo; ở chi tiết đơn là số tiền thực trả đã chụp theo đơn. */
    private BigDecimal payableAmount;
    private boolean demoPayment;
    private Integer durationDays;
    private String status;
    private String description;
}
