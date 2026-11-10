package com.sportscenter.management.service;

import com.sportscenter.management.repository.ClassRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.temporal.ChronoUnit;

@Service @RequiredArgsConstructor
public class MemberReminderService {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private final ClassRepository classes;
    private final EntityManager em;
    private final MemberNotificationOutboxService outbox;
    private final MemberReminderEligibility eligibility;

    @Transactional
    public void remindClass(int id) {
        var row=classes.findByIdForUpdate(id).orElse(null);
        if(row==null)return;
        em.refresh(row);
        LocalDateTime now=LocalDateTime.now(clock);
        if(!"SCHEDULED".equals(row.getStatus()) || !row.getScheduleTime().isAfter(now) || row.getScheduleTime().isAfter(now.plusHours(24)))return;
        var members=jdbc.queryForList("SELECT b.member_id FROM class_bookings b WITH(UPDLOCK,HOLDLOCK) JOIN users u ON u.user_id=b.member_id JOIN roles r ON r.role_id=u.role_id WHERE b.class_id=? AND b.status='BOOKED' AND u.status='ACTIVE' AND r.role_name='MEMBER' ORDER BY b.member_id",Integer.class,id);
        for(int member:members)outbox.enqueue("CLASS_REMINDER:"+id+":"+row.getScheduleTime(),row.getCoachId(),member,"Nhắc lịch học","Thông báo tự động Sportiva: Lớp "+row.getClassName()+" bắt đầu lúc "+row.getScheduleTime()+". Vui lòng xem lịch học và phòng học.","/schedule");
    }

    @Transactional
    public void remindExpiry(int id) {
        var initial=jdbc.queryForList("SELECT member_id FROM member_subscriptions WHERE subscription_id=?",Integer.class,id);
        if(initial.isEmpty())return;
        // Match payment confirmation/refund: order -> member -> subscription.
        // Lock the member's order range before taking the member lock, otherwise
        // checking CONFIRMED extensions could deadlock with order -> member confirmation.
        jdbc.queryForList("SELECT membership_order_id FROM membership_orders WITH(UPDLOCK,HOLDLOCK) WHERE member_id=? ORDER BY membership_order_id",Integer.class,initial.getFirst());
        jdbc.queryForList("SELECT user_id FROM users WITH(UPDLOCK,HOLDLOCK) WHERE user_id=?",Integer.class,initial.getFirst());
        var rows=jdbc.queryForList("SELECT member_id,end_date,package_id FROM member_subscriptions WITH(UPDLOCK,HOLDLOCK) WHERE subscription_id=?",id);
        if(rows.isEmpty())return;
        var row=rows.getFirst();int member=((Number)row.get("member_id")).intValue();
        LocalDate end=((java.sql.Date)row.get("end_date")).toLocalDate();
        long days=ChronoUnit.DAYS.between(LocalDate.now(clock),end);
        if(days<1 || days>7 || !eligibility.validSubscription(id,member,end))return;
        var senders=jdbc.queryForList("SELECT TOP(1) u.user_id FROM users u JOIN roles r ON r.role_id=u.role_id WHERE r.role_name='CENTER_MANAGER' AND u.status='ACTIVE' ORDER BY u.user_id",Integer.class);
        if(senders.isEmpty())return; // Never manufacture a privileged system account.
        String name=jdbc.queryForObject("SELECT package_name FROM membership_packages WHERE package_id=?",String.class,row.get("package_id"));
        outbox.enqueue("PACKAGE_EXPIRY:"+id+":"+end+":"+(days==1?1:7),senders.getFirst(),member,"Nhắc hạn gói thành viên","Thông báo tự động Sportiva: Gói "+name+" hết hạn ngày "+end+". Vui lòng xem thông tin và gia hạn nếu cần.","/memberships");
    }
}
