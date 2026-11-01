package com.sportscenter.management.payment;

import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** Lưu thông báo trong cùng transaction với thu tiền/gia hạn để chỉ báo thành công sau khi dữ liệu được ghi. */
@Service @RequiredArgsConstructor @Transactional
// TẠO MỚI: MembershipNotificationService — Tạo thông báo cùng transaction với thu tiền/gia hạn; chỉ lưu trong website, không gửi email.
public class MembershipNotificationService {
    private final MembershipNotificationRepository notifications;
    private final UserRepository users;
    public record Notification(String status) {}
    public record Delivery(Notification notification) {}

    public void notifyConfirmed(MembershipOrder order, Invoice invoice, MemberSubscription subscription) {
        if (notifications.findByOrderId(order.getId()).isPresent()) return;
        User member = users.findById(order.getMemberId()).orElseThrow(() -> new IllegalStateException("Không tìm thấy chủ đơn đã thanh toán"));
        String action = "NEW".equals(order.getKind()) ? "đăng ký gói mới" :
                java.util.Objects.equals(order.getSourcePackageId(), order.getPackageId()) ? "gia hạn gói hiện tại" : "gia hạn với gói mới";
        DateTimeFormatter date = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        MembershipNotification notification = new MembershipNotification();
        notification.setOrderId(order.getId()); notification.setMemberId(order.getMemberId());
        notification.setCreatedAt(LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")));
        notification.setContent("Thành viên " + member.getFullName() + " (TV" + order.getMemberId() + ") đã " + action
                + " thành công: " + order.getPackageName() + ". Mã thanh toán: HD" + invoice.getId() + " TV" + order.getMemberId()
                + ". Số tiền đã thu: " + invoice.getAmount().toPlainString() + " VND. Thời hạn: "
                + date.format(subscription.getStartDate()) + " – " + date.format(subscription.getEndDate()) + ".");
        notifications.saveAndFlush(notification);
    }

    /** Controller đã giới hạn đơn cho chính chủ/lễ tân/quản lý; chỉ trả SENT khi thông báo tồn tại trong SQL. */
    @Transactional(readOnly = true)
    public Delivery status(Integer orderId) {
        return notifications.findByOrderId(orderId).map(n -> new Delivery(new Notification("SENT"))).orElse(null);
    }
}
