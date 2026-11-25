package com.sportscenter.management.service;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.booking.waitlist-worker-enabled", matchIfMissing = true)
public class WaitlistJobs {
    private static final Logger log = LoggerFactory.getLogger(WaitlistJobs.class);
    private final FlexibleBookingPolicy policy;

    @Scheduled(fixedDelayString = "${app.booking.waitlist-poll-ms:30000}")
    public void advanceWaitlists() {
        for (int classId : policy.pendingSessions()) {
            try {
                policy.poll(classId);
            } catch (RuntimeException ex) {
                log.warn("Waitlist processing will retry for class {}", classId, ex);
            }
        }
    }
}
