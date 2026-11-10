package com.sportscenter.management.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.HexFormat;

@Service @RequiredArgsConstructor
public class MemberNotificationOutboxService {
    private final JdbcTemplate jdbc;
    private final Clock memberNotificationClock;
    private final MemberNotificationPublisher publisher;

    /** Joins the business transaction: both history and outbox roll back with it. */
    @Transactional
    public long enqueue(String key,int sender,int recipient,String title,String content,String link) {
        if(key==null || !key.matches("[A-Za-z0-9:._-]{1,200}"))throw new IllegalArgumentException("Invalid ME09 event key");
        if(title==null || title.isBlank() || title.length()>150 || content==null || content.isBlank() || content.length()>4000
                || !("/schedule".equals(link)||"/memberships".equals(link)))throw new IllegalArgumentException("Invalid ME09 content");
        String resource;
        try{resource="ME09:"+HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((key+":"+recipient).getBytes(StandardCharsets.UTF_8)));}
        catch(java.security.NoSuchAlgorithmException error){throw new IllegalStateException(error);}
        // SQL Server implicit transactions begin on a table statement, not necessarily EXEC.
        // Materialize the transaction before requesting a transaction-owned application lock.
        jdbc.queryForObject("SELECT COUNT(*) FROM member_notification_outbox WHERE event_key=? AND recipient_id=?",Integer.class,key,recipient);
        Integer locked=jdbc.queryForObject("DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=?,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r",Integer.class,resource);
        if(locked==null || locked<0)throw new IllegalStateException("Cannot lock ME09 event identity: "+locked);
        var existing=jdbc.queryForList("SELECT id,notification_id FROM member_notification_outbox WHERE event_key=? AND recipient_id=?",key,recipient);
        if(!existing.isEmpty())return ((Number)existing.getFirst().get("notification_id")).longValue();
        LocalDateTime now=LocalDateTime.now(memberNotificationClock);
        Long notification=jdbc.queryForObject("INSERT general_notifications(sender_id,recipient_id,title,content,link,created_at) OUTPUT INSERTED.id VALUES(?,?,?,?,?,?)",Long.class,sender,recipient,title,content,link,now);
        Long event=jdbc.queryForObject("INSERT member_notification_outbox(event_key,recipient_id,notification_id,state,attempts,next_attempt_at,created_at) OUTPUT INSERTED.id VALUES(?,?,?,'PENDING',0,?,?)",Long.class,key,recipient,notification,now,now);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
            @Override public void afterCommit(){publisher.requestPublication(event);}
        });
        return notification;
    }
}
