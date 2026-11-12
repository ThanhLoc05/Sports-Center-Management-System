package com.sportscenter.management.config;

import com.sportscenter.management.service.MemberNotificationPublisher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.*;
import org.springframework.scheduling.annotation.*;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import java.time.Clock;
import java.time.ZoneId;

@Configuration
@EnableScheduling
public class MemberNotificationConfig {
    @Bean @ConditionalOnMissingBean(Clock.class)
    public Clock memberNotificationClock(){return Clock.system(ZoneId.of("Asia/Ho_Chi_Minh"));}
    @Bean
    public ThreadPoolTaskExecutor memberNotificationExecutor(){
        var executor=new ThreadPoolTaskExecutor();executor.setCorePoolSize(1);executor.setMaxPoolSize(2);
        executor.setQueueCapacity(100);executor.setThreadNamePrefix("member-publication-");
        executor.setWaitForTasksToCompleteOnShutdown(true);executor.setAwaitTerminationSeconds(5);return executor;
    }
    @Configuration
    @ConditionalOnProperty(name="app.me09.scheduling-enabled",havingValue="true",matchIfMissing=true)
    static class Scheduling {
        @Bean Worker memberNotificationWorker(MemberNotificationPublisher publisher){return new Worker(publisher);}
    }
    static class Worker {
        private final MemberNotificationPublisher publisher;
        Worker(MemberNotificationPublisher publisher){this.publisher=publisher;}
        @Scheduled(fixedDelayString="${app.me09.publication-delay-ms:5000}") public void publish(){publisher.drain();}
    }
}
