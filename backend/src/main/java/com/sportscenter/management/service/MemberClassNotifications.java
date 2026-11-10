package com.sportscenter.management.service;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.Classes;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;
import java.util.*;

/** Called inside the class transaction, after locking the class and before cancelling its roster. */
@Service @RequiredArgsConstructor
public class MemberClassNotifications {
    private final JdbcTemplate jdbc;
    private final MemberNotificationOutboxService outbox;
    private final SecurityUtils security;
    public record Before(LocalDateTime time,Integer room,Integer coach) {
        public static Before of(Classes row){return new Before(row.getScheduleTime(),row.getRoomId(),row.getCoachId());}
    }
    public void changed(Before before,Classes row) {
        var changes=new ArrayList<String>();
        if(!Objects.equals(before.time(),row.getScheduleTime()))changes.add("Lịch: "+before.time()+" → "+row.getScheduleTime());
        if(!Objects.equals(before.room(),row.getRoomId()))changes.add("Phòng: "+roomName(before.room())+" → "+roomName(row.getRoomId()));
        if(!Objects.equals(before.coach(),row.getCoachId()))changes.add("HLV: "+coachName(before.coach())+" → "+coachName(row.getCoachId()));
        if(changes.isEmpty())return;
        send("CLASS_CHANGED:"+row.getId()+":"+UUID.randomUUID(),row,"Lớp học thay đổi lịch",
                "Thông báo tự động Sportiva. Lớp "+row.getClassName()+".\n"+String.join("\n",changes));
    }
    public void cancelled(Classes row) {
        send("CLASS_CANCELLED:"+row.getId(),row,"Lớp học đã hủy",
                "Thông báo tự động Sportiva. Lớp "+row.getClassName()+", lịch "+row.getScheduleTime()+" đã HỦY. Vui lòng xem lại lịch học.");
    }
    private void send(String key,Classes row,String title,String content) {
        var recipients=jdbc.queryForList("SELECT b.member_id FROM class_bookings b WITH(UPDLOCK,HOLDLOCK) JOIN users u ON u.user_id=b.member_id JOIN roles r ON r.role_id=u.role_id WHERE b.class_id=? AND b.status='BOOKED' AND r.role_name='MEMBER' ORDER BY b.member_id",Integer.class,row.getId());
        if(recipients.isEmpty())return;
        Integer sender=security.getCurrentUserId();
        if(sender==null)throw new IllegalStateException("ME09 class event requires an authenticated actor");
        for(int recipient:recipients)outbox.enqueue(key,sender,recipient,title,content,"/schedule");
    }
    private String roomName(int id){return jdbc.queryForObject("SELECT room_name FROM rooms WHERE room_id=?",String.class,id);}
    private String coachName(int id){return jdbc.queryForObject("SELECT full_name FROM users WHERE user_id=?",String.class,id);}
}
