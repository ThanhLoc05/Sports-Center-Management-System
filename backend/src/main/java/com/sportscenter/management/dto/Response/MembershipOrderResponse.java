package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Getter;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;

@Getter
@Builder
public class MembershipOrderResponse {
    private Integer id;
    private Integer memberId;
    private String kind;
    private Integer sourceSubscriptionId;
    private Integer sourcePackageId;
    private String status;
    @JsonProperty("package")
    private MembershipOfferResponse packageInfo;
    private InvoiceResponse invoice;
    private String paymentReference;
    // BỔ SUNG: tên đúng chủ đơn để QR không lấy nhầm tên lễ tân đang đăng nhập.
    private String memberName;
    // BỔ SUNG: ngân hàng snapshot của đơn; đổi Cài đặt không đổi tài khoản nhận trên hóa đơn cũ.
    private com.sportscenter.management.payment.BankAccountData bankAccount;
    // BỔ SUNG: trạng thái/tổng tiền nhận do BE đối soát; FE chỉ hiển thị, không tự đặt PAID.
    private BankTransfer bankTransfer;
    // BỔ SUNG: kết quả lưu thông báo trong SQL sau xác nhận; không phải trạng thái gửi email.
    private com.sportscenter.management.payment.MembershipNotificationService.Delivery delivery;
    /** Trả trạng thái đối soát để FE chỉ hiển thị dữ liệu thật từ server. */
    public record BankTransfer(String status, java.math.BigDecimal receivedAmount, String transactionId, boolean automationEnabled) {}
    private LocalDateTime createdAt;
    private LocalDateTime confirmedAt;
    private MemberSubscriptionResponse subscription;
    private Integer version;
}
