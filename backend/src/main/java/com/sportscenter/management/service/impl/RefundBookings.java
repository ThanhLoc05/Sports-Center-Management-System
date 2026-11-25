package com.sportscenter.management.service.impl;

import com.sportscenter.management.service.MemberNotificationOutboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;

@Service
@RequiredArgsConstructor
class RefundBookings {
    private final JdbcTemplate jdbc;
    private final MemberNotificationOutboxService notifications;
    record Booking(int id, String name) {}

    // Chụp danh sách trước và sau khi đổi quyền gói dưới cùng khóa thành viên.
    List<Booking> covered(int member, LocalDateTime now) {
        return jdbc.query("""
                SELECT b.booking_id,c.class_name FROM class_bookings b
                JOIN classes c ON c.class_id=b.class_id
                WHERE b.member_id=? AND b.status='BOOKED' AND c.status='SCHEDULED' AND c.schedule_time>?
                  AND EXISTS (SELECT 1 FROM member_subscriptions s
                    JOIN membership_packages p ON p.package_id=s.package_id
                    WHERE s.member_id=b.member_id AND s.status='ACTIVE'
                      AND CAST(c.schedule_time AS date) BETWEEN s.start_date AND s.end_date
                      AND (COALESCE(s.entitlement_level,p.access_level)='VIP'
                        OR (c.required_access_level='STANDARD'
                            AND (c.course_id IS NOT NULL OR s.selected_sport_id IS NULL OR s.selected_sport_id=c.sport_id))))
                """, (rs, i) -> new Booking(rs.getInt(1), rs.getString(2)), member, now);
    }

    // [FLOW 3] KHI HOÀN TIỀN: hủy đăng ký lớp không còn gói bao phủ và gửi thông báo cho Member.
    void cancelUncovered(List<Booking> before, int member, int staff, int invoice, LocalDateTime now) {
        if (before.isEmpty()) return;
        var retained = new HashSet<Integer>();
        covered(member, now).forEach(b -> retained.add(b.id()));
        for (var booking : before) {
            if (retained.contains(booking.id())) continue;
            if (jdbc.update("UPDATE class_bookings SET status='CANCELLED' WHERE booking_id=? AND member_id=? AND status='BOOKED'",
                    booking.id(), member) == 1)
                notifications.enqueue("REFUND:" + invoice + ":" + booking.id(), staff, member, "Đã hủy đăng ký lớp",
                        "Lớp " + booking.name() + " đã được hủy đăng ký vì gói còn lại không bao phủ buổi học.", "/schedule");
        }
    }
}
