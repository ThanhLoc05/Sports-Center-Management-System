package com.sportscenter.management.service;

import com.sportscenter.management.repository.GeneralNotificationRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.UUID;

@Service @Slf4j
public class MemberNotificationPublisher {
    private final JdbcTemplate jdbc;
    private final GeneralNotificationRepository history;
    private final NotificationDeliveryService delivery;
    private final Clock clock;
    private final TransactionTemplate tx;
    private final TaskExecutor executor;
    private final MemberReminderEligibility eligibility;
    public MemberNotificationPublisher(JdbcTemplate jdbc,GeneralNotificationRepository history,
            NotificationDeliveryService delivery,Clock memberNotificationClock,PlatformTransactionManager manager,
            @Qualifier("memberNotificationExecutor") TaskExecutor executor,MemberReminderEligibility eligibility) {
        this.jdbc=jdbc;this.history=history;this.delivery=delivery;this.clock=memberNotificationClock;
        this.executor=executor;
        this.eligibility=eligibility;
        tx=new TransactionTemplate(manager);tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    public void requestPublication(long id) {
        try{executor.execute(()->publishOne(id));}
        catch(RuntimeException error){log.warn("ME09 event={} remains durable for polling",id);}
    }
    public void drain() {
        LocalDateTime now=LocalDateTime.now(clock);
        var ids=tx.execute(status->jdbc.queryForList("SELECT TOP(100) id FROM member_notification_outbox WHERE ((state='PENDING' AND next_attempt_at<=?) OR (state='SENDING' AND lease_until<=?)) ORDER BY id",Long.class,now,now));
        for(Long id:ids)publishOne(id);
    }
    /** Claim/ack use short independent transactions; no JDBC transaction surrounds SSE writes. */
    @Transactional(propagation=Propagation.NOT_SUPPORTED)
    public void publishOne(long id) {
        String token=UUID.randomUUID().toString();LocalDateTime now=LocalDateTime.now(clock);
        try {
            var claimed=tx.execute(status->jdbc.queryForList("UPDATE member_notification_outbox SET state='SENDING',attempts=attempts+1,lease_token=?,lease_until=? OUTPUT INSERTED.notification_id,INSERTED.attempts WHERE id=? AND attempts<4 AND ((state='PENDING' AND next_attempt_at<=?) OR (state='SENDING' AND lease_until<=?))",token,now.plusMinutes(1),id,now,now));
            if(claimed.isEmpty()) {
                tx.executeWithoutResult(status->jdbc.update("UPDATE member_notification_outbox SET state='FAILED',lease_token=NULL,lease_until=NULL WHERE id=? AND state='SENDING' AND attempts>=4 AND lease_until<=?",id,now));
                return;
            }
            long notification=((Number)claimed.getFirst().get("notification_id")).longValue();
            try {
                var row=history.findById(notification).orElseThrow();
                var event=jdbc.queryForMap("SELECT event_key,recipient_id FROM member_notification_outbox WHERE id=?",id);
                if(eligibility.eligible((String)event.get("event_key"),((Number)event.get("recipient_id")).intValue()))delivery.publishPersisted(row);
                tx.executeWithoutResult(status->jdbc.update("UPDATE member_notification_outbox SET state='SENT',published_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",LocalDateTime.now(clock),id,token));
            } catch(RuntimeException error) {
                int attempt=((Number)claimed.getFirst().get("attempts")).intValue();
                int delay=attempt==1?1:attempt==2?5:15;
                tx.executeWithoutResult(status->jdbc.update("UPDATE member_notification_outbox SET state=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?",attempt>=4?"FAILED":"PENDING",LocalDateTime.now(clock).plusMinutes(delay),id,token));
                log.warn("ME09 publication deferred event={} failure={}",id,error.getClass().getSimpleName());
            }
        }catch(RuntimeException error){log.warn("ME09 worker failure event={} failure={}",id,error.getClass().getSimpleName());}
    }
}
