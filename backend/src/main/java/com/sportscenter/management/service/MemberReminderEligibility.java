package com.sportscenter.management.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.time.*;

/** Recheck durable reminders against current business state before an SSE attempt. */
@Component @RequiredArgsConstructor
public class MemberReminderEligibility {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public boolean eligible(String key,int member) {
        if(key.startsWith("CLASS_REMINDER:")) {
            String[] parts=key.split(":",3);
            return jdbc.queryForObject("SELECT COUNT(*) FROM classes c JOIN class_bookings b ON b.class_id=c.class_id JOIN users u ON u.user_id=b.member_id WHERE c.class_id=? AND c.schedule_time=? AND c.schedule_time>? AND c.status='SCHEDULED' AND b.member_id=? AND b.status='BOOKED' AND u.status='ACTIVE'",Integer.class,Integer.parseInt(parts[1]),LocalDateTime.parse(parts[2]),LocalDateTime.now(clock),member)>0;
        }
        if(key.startsWith("PACKAGE_EXPIRY:")) {
            String[] parts=key.split(":");
            LocalDate end=LocalDate.parse(parts[2]);
            long days=java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(clock),end);
            int threshold=Integer.parseInt(parts[3]);
            return (threshold==1?days==1:days>1 && days<=7) && validSubscription(Integer.parseInt(parts[1]),member,end);
        }
        return true;
    }
    public boolean validSubscription(int subscription,int member,LocalDate end) {
        LocalDate today=LocalDate.now(clock);
        return jdbc.queryForObject("SELECT COUNT(*) FROM member_subscriptions s JOIN users u ON u.user_id=s.member_id JOIN roles r ON r.role_id=u.role_id WHERE s.subscription_id=? AND s.member_id=? AND s.end_date=? AND s.status='ACTIVE' AND s.start_date<=? AND s.end_date>? AND u.status='ACTIVE' AND r.role_name='MEMBER' AND NOT EXISTS(SELECT 1 FROM invoices i WHERE i.subscription_id=s.subscription_id AND i.payment_status='REFUNDED') AND NOT EXISTS(SELECT 1 FROM member_subscriptions n JOIN invoices i ON i.subscription_id=n.subscription_id JOIN membership_orders o ON o.membership_order_id=i.membership_order_id WHERE n.member_id=s.member_id AND n.subscription_id<>s.subscription_id AND n.status='ACTIVE' AND n.start_date<=DATEADD(day,1,s.end_date) AND n.end_date>s.end_date AND i.payment_status='PAID' AND o.status='CONFIRMED')",Integer.class,subscription,member,end,today,today)>0;
    }
}
