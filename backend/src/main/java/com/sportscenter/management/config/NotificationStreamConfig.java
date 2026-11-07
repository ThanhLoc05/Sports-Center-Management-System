package com.sportscenter.management.config;

import com.sportscenter.management.service.NotificationDeliveryService;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import java.time.Duration;

@Configuration
@ConditionalOnWebApplication(type=ConditionalOnWebApplication.Type.SERVLET)
public class NotificationStreamConfig {
    @Bean
    public ThreadPoolTaskScheduler notificationHeartbeatScheduler() {
        var scheduler=new ThreadPoolTaskScheduler();
        scheduler.setPoolSize(1);
        scheduler.setDaemon(true);
        scheduler.setThreadNamePrefix("notification-heartbeat-");
        scheduler.setRemoveOnCancelPolicy(true);
        return scheduler;
    }
    @Bean
    public DisposableBean notificationHeartbeatTask(
            @Qualifier("notificationHeartbeatScheduler") ThreadPoolTaskScheduler scheduler,
            NotificationDeliveryService service) {
        var future=scheduler.scheduleWithFixedDelay(service::heartbeat,Duration.ofSeconds(15));
        return ()->future.cancel(false);
    }
}
