package com.sportscenter.management.payment;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

/** Demo chỉ thay khoản thu QR khi được bật; không sửa giá gói và không nhận giá do FE gửi. */
// TẠO MỚI: PaymentIntegrationPropertiesTest — Kiểm thử chế độ demo mặc định tắt và chỉ cho các mức QR 5.000/6.000/7.000 VND đã quy định.
class PaymentIntegrationPropertiesTest {
    @Test void demoIsOffByDefault() {
        var properties=new PaymentIntegrationProperties();
        assertEquals(new BigDecimal("900000"),properties.qrAmount(1,new BigDecimal("900000")));
    }
    @Test void demoUsesTheThreeSmallAmountsWithoutChangingTheCatalogPrice() {
        var properties=new PaymentIntegrationProperties();properties.setDemoPaymentsEnabled(true);
        for(int id=1;id<=3;id++)assertEquals(BigDecimal.valueOf(4000+id*1000),properties.qrAmount(id,new BigDecimal("900000")));
        assertEquals(new BigDecimal("900000"),properties.qrAmount(4,new BigDecimal("900000")));
    }
    @Test void demoCannotAccidentallyChargeAnUnapprovedLargeAmount() {
        var properties=new PaymentIntegrationProperties();properties.setDemoPaymentsEnabled(true);properties.getDemoAmounts().put(1,new BigDecimal("5000000"));
        assertThrows(IllegalStateException.class,()->properties.qrAmount(1,new BigDecimal("900000")));
    }
}
