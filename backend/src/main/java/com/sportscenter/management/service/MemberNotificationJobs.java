package com.sportscenter.management.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.*;

@Component @RequiredArgsConstructor @Slf4j
@ConditionalOnProperty(name="app.me09.scheduling-enabled",havingValue="true",matchIfMissing=true)
public class MemberNotificationJobs {
    private final JdbcTemplate jdbc;
    private final MemberReminderService reminders;
    private final Clock clock;
    @Scheduled(fixedDelayString="${app.me09.reminder-delay-ms:300000}")
    public void classes(){scan(true);}
    @Scheduled(cron="${app.me09.expiry-cron:0 0 9 * * *}",zone="Asia/Ho_Chi_Minh")
    public void expiry(){scan(false);}
    @EventListener(ApplicationReadyEvent.class)
    public void catchUp(){if(!LocalTime.now(clock).isBefore(LocalTime.of(9,0)))expiry();}
    private void scan(boolean classScan) {
        int cursor=0;
        while(true) {
            var ids=classScan?jdbc.queryForList("SELECT TOP(100) class_id FROM classes WHERE class_id>? AND status='SCHEDULED' AND schedule_time>? AND schedule_time<=? ORDER BY class_id",Integer.class,cursor,LocalDateTime.now(clock),LocalDateTime.now(clock).plusHours(24)):
                jdbc.queryForList("SELECT TOP(100) subscription_id FROM member_subscriptions WHERE subscription_id>? AND status='ACTIVE' AND end_date>? AND end_date<=? ORDER BY subscription_id",Integer.class,cursor,LocalDate.now(clock),LocalDate.now(clock).plusDays(7));
            if(ids.isEmpty())return;
            for(int id:ids){try{if(classScan)reminders.remindClass(id);else reminders.remindExpiry(id);}catch(RuntimeException error){log.warn("ME09 scan deferred kind={} id={} failure={}",classScan?"CLASS":"EXPIRY",id,error.getClass().getSimpleName());}}
            cursor=ids.getLast();
        }
    }
}
