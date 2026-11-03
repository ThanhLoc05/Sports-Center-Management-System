package com.sportscenter.management.payment;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Nationalized;
import java.time.LocalDateTime;

/** Thông báo xác nhận trên website, lưu đúng một bản ghi cho mỗi đơn đã hoàn thành. */
@Entity @Table(name = "membership_notifications")
@Getter @Setter @NoArgsConstructor
// TẠO MỚI: MembershipNotification — Entity thông báo gia hạn/đăng ký thành công trong website; mỗi đơn chỉ có một thông báo.
public class MembershipNotification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "order_id", nullable = false, unique = true) private Integer orderId;
    @Column(name = "member_id", nullable = false) private Integer memberId;
    @Nationalized @Column(columnDefinition = "NVARCHAR(MAX)", nullable = false) private String content;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
}
