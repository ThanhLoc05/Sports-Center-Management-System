package com.sportscenter.management.training;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component @RequiredArgsConstructor
@ConditionalOnProperty(name="app.training.scheduling-enabled",havingValue="true",matchIfMissing=true)
public class TrainingJobs {
    private final TrainingProgramService programs;
    private final CourseOrderService orders;
    @Scheduled(fixedDelayString="${app.training.order-expiration-delay-ms:60000}",initialDelayString="${app.training.job-initial-delay-ms:10000}")
    public void expireOrders() { orders.expirePendingOrders(); }
    @Scheduled(fixedDelayString="${app.training.schedule-delay-ms:900000}",initialDelayString="${app.training.job-initial-delay-ms:10000}")
    public void maintainSchedules() { programs.maintainSchedules(); }
}
