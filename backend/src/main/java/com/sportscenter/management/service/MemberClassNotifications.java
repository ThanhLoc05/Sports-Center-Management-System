package com.sportscenter.management.service;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.ClassBooking;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** Called inside the class transaction, after locking the class and before cancelling its roster. */
@Service @RequiredArgsConstructor
public class MemberClassNotifications {
    private final JdbcTemplate jdbc;
    private final MemberNotificationOutboxService outbox;
    private final SecurityUtils security;
    public record Before(LocalDateTime time,Integer room,Integer coach,String name,Integer duration) {
        public static Before of(Classes row){return new Before(row.getScheduleTime(),row.getRoomId(),row.getCoachId(),row.getClassName(),row.getDurationMinutes());}
    }
    private static final DateTimeFormatter CLASS_DAY = DateTimeFormatter.ofPattern("EEEE, dd/MM/yyyy", Locale.forLanguageTag("vi-VN"));
    private static final DateTimeFormatter CLASS_TIME = DateTimeFormatter.ofPattern("HH:mm");

    static String sessionSchedule(LocalDateTime start, Integer duration) {
        var slot = Arrays.stream(FlexibleClassSlot.values())
                .filter(s -> s.start().equals(start.toLocalTime()) && Objects.equals(duration, FlexibleClassSlot.DURATION_MINUTES))
                .findFirst().map(s -> "Ca " + s.name().substring("SLOT_".length())).orElse("Ngoài khung ca");
        return start.format(CLASS_DAY) + " · " + slot + " · " + start.format(CLASS_TIME) + "–"
                + start.plusMinutes(duration).format(CLASS_TIME);
    }

    public void bookingConfirmed(ClassBooking booking, Classes clazz) {
        notifyBooking("BOOKING_CONFIRMED", booking, clazz, "Đăng ký lớp thành công",
                "Bạn đã đăng ký thành công lớp ");
    }

    public void bookingCancelled(ClassBooking booking, Classes clazz) {
        notifyBooking("BOOKING_CANCELLED", booking, clazz, "Hủy đăng ký lớp thành công",
                "Bạn đã hủy đăng ký lớp ");
    }

    private void notifyBooking(String event, ClassBooking booking, Classes clazz, String title, String message) {
        // Each booking cycle has its own timestamp, even when it reuses the booking row.
        String key = event + ":" + booking.getId() + ":" + booking.getBookedAt();
        String content = message + clazz.getClassName() + ".\n" + sessionSchedule(clazz.getScheduleTime(), clazz.getDurationMinutes());
        outbox.enqueue(key, clazz.getCoachId(), booking.getMemberId(), title, content, "/schedule");
    }

    public void changed(Before before,Classes row) {
        var changes=new ArrayList<String>();
        if(!Objects.equals(before.name(),row.getClassName()))changes.add("Tên lớp: "+before.name()+" → "+row.getClassName());
        boolean moved = !Objects.equals(before.time(), row.getScheduleTime()) || !Objects.equals(before.duration(), row.getDurationMinutes());
        if (moved) {
            changes.add("Lịch cũ: " + sessionSchedule(before.time(), before.duration()));
            changes.add("Lịch mới: " + sessionSchedule(row.getScheduleTime(), row.getDurationMinutes()));
        }
        if(!Objects.equals(before.room(),row.getRoomId()))changes.add("Phòng: "+roomName(before.room())+" → "+roomName(row.getRoomId()));
        if(!Objects.equals(before.coach(),row.getCoachId()))changes.add("HLV: "+coachName(before.coach())+" → "+coachName(row.getCoachId()));
        if(changes.isEmpty())return;
        String key = "CLASS_CHANGED:" + row.getId() + ":" + UUID.randomUUID();
        String content = row.getClassName() + "\n"
                + (moved ? "" : sessionSchedule(row.getScheduleTime(), row.getDurationMinutes()) + "\n")
                + String.join("\n", changes);
        Integer sender = security.getCurrentUserId();
        if (sender == null) throw new IllegalStateException("Class event requires an authenticated actor");
        send(key, row, sender, "Lớp học thay đổi lịch", content);
        if (!Objects.equals(before.coach(), row.getCoachId())) {
            outbox.enqueue(key, sender, before.coach(), "Lớp đã chuyển cho HLV khác", content, "/schedule");
            outbox.enqueue(key, sender, row.getCoachId(), "Bạn được phân công lớp", content, "/schedule");
        } else {
            outbox.enqueue(key, sender, row.getCoachId(), "Lịch dạy đã thay đổi", content, "/schedule");
        }
    }
    public void cancelled(Classes row, int sender, String reason) {
        var recipients = jdbc.queryForList("""
                SELECT recipient.member_id, MAX(recipient.booked) AS booked FROM (
                    SELECT member_id, 1 AS booked FROM dbo.class_bookings WHERE class_id=? AND status='BOOKED'
                    UNION ALL
                    SELECT member_id, 0 AS booked FROM dbo.class_waitlist WHERE class_id=? AND status IN ('QUEUED','INVITED')
                ) recipient JOIN dbo.users u ON u.user_id=recipient.member_id
                JOIN dbo.roles r ON r.role_id=u.role_id
                WHERE r.role_name='MEMBER'
                GROUP BY recipient.member_id ORDER BY recipient.member_id
                """, row.getId(), row.getId());
        outbox.enqueue("CLASS_CANCELLED:" + row.getId(), sender, row.getCoachId(), "Lớp được phân công đã bị hủy",
                row.getClassName() + "\n" + sessionSchedule(row.getScheduleTime(), row.getDurationMinutes()) + "\nLý do: " + reason, "/schedule");
        if (recipients.isEmpty()) return;
        String sport = jdbc.queryForObject("SELECT sport_name FROM dbo.sports WHERE sport_id=?", String.class, row.getSportId());
        String prefix = row.getClassName() + " (" + sport + ")\n"
                + sessionSchedule(row.getScheduleTime(), row.getDurationMinutes()) + "\nLý do: " + reason + ".\n";
        for (var recipient : recipients) {
            int member = ((Number) recipient.get("member_id")).intValue();
            boolean booked = ((Number) recipient.get("booked")).intValue() == 1;
            String result = booked ? "Đăng ký của bạn đã được trung tâm hủy."
                    : "Danh sách chờ và lời mời nhận chỗ của buổi này đã được đóng.";
            outbox.enqueue("CLASS_CANCELLED:" + row.getId(), sender, member, "Buổi tập của bạn đã bị hủy",
                    prefix + result + " Bạn không bị tính vi phạm. Bạn có thể chọn buổi khác tại Đăng ký lớp.", "/schedule");
        }
    }

    private void send(String key,Classes row,int sender,String title,String content) {
        var recipients = jdbc.queryForList("""
                SELECT recipient.member_id FROM (
                    SELECT member_id FROM dbo.class_bookings WITH(UPDLOCK,HOLDLOCK) WHERE class_id=? AND status='BOOKED'
                    UNION
                    SELECT member_id FROM dbo.class_waitlist WHERE class_id=? AND status IN ('QUEUED','INVITED')
                ) recipient JOIN dbo.users u ON u.user_id=recipient.member_id
                JOIN dbo.roles r ON r.role_id=u.role_id
                WHERE r.role_name='MEMBER'
                ORDER BY recipient.member_id
                """, Integer.class, row.getId(), row.getId());
        for(int recipient:recipients)outbox.enqueue(key,sender,recipient,title,content,"/schedule");
    }
    private String roomName(int id){return jdbc.queryForObject("SELECT room_name FROM rooms WHERE room_id=?",String.class,id);}
    private String coachName(int id){return jdbc.queryForObject("SELECT full_name FROM users WHERE user_id=?",String.class,id);}
}
