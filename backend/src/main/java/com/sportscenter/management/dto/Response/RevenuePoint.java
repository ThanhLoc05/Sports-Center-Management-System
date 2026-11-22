package com.sportscenter.management.dto.Response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * [FLOW 3] Doanh thu của MỘT NGÀY trong báo cáo: tổng thu (theo ngày thanh toán),
 * tiền hoàn (theo ngày hoàn) và doanh thu ròng = thu - hoàn. FE dùng để vẽ biểu đồ
 * và gộp thành tháng/quý/năm; cộng tất cả các ngày luôn bằng số tổng của báo cáo.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RevenuePoint {
    private LocalDate date;
    private BigDecimal gross;
    private BigDecimal refunded;
    private BigDecimal net;
}
