package com.sportscenter.management.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

/** Lấy thông báo theo đơn đã được kiểm tra quyền đọc; unique orderId chặn tạo trùng. */
// TẠO MỚI: MembershipNotificationRepository — Đọc thông báo theo orderId và ngăn sinh bản ghi trùng khi xác nhận lại.
public interface MembershipNotificationRepository extends JpaRepository<MembershipNotification, Long> {
    Optional<MembershipNotification> findByOrderId(Integer orderId);
}
