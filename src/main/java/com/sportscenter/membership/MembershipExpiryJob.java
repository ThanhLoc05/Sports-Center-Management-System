package com.sportscenter.membership;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class MembershipExpiryJob {
    private final JdbcTemplate jdbc;

    public MembershipExpiryJob(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "0 0 1 * * *")
    @Transactional
    public void expireMemberships() {
        jdbc.update("""
                UPDATE dbo.user_memberships
                SET status = 'EXPIRED'
                WHERE status = 'ACTIVE' AND end_date < CAST(GETDATE() AS DATE)
                """);
    }
}
