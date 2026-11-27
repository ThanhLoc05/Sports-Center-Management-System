package com.sportscenter.management.config;

import com.sportscenter.management.service.FlexibleClassSlot;
import com.sportscenter.management.service.WeeklyScheduleService;
import com.sportscenter.management.training.TrainingLock;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Configuration(proxyBeanMethods = false)
@Profile("demo")
@ConditionalOnProperty(name = "app.demo.standard-data.enabled", havingValue = "true")
class StandardDemoDataConfig {
    private static final String SEED_MARKER = "SportivaDemoSeedV28";

    @Bean
    ApplicationRunner prepareStandardDemo(
            JdbcTemplate jdbc, PasswordEncoder encoder, PlatformTransactionManager transactions,
            TrainingLock trainingLock, WeeklyScheduleService schedules, Clock clock,
            @Value("${app.demo.standard-data.database:}") String database,
            @Value("${app.demo.standard-data.password:}") String password,
            @Value("${app.demo.flow4.enabled:true}") boolean legacySeedEnabled) {
        return args -> {
            if (!database.matches("SportivaDemo_[A-Za-z0-9_]+")
                    || "SportivaDemo_Final".equalsIgnoreCase(database)
                    || !database.equals(jdbc.queryForObject("SELECT DB_NAME()", String.class))) {
                throw new IllegalStateException("Select an explicitly approved personal SportivaDemo_* database.");
            }
            int passwordBytes = password.getBytes(StandardCharsets.UTF_8).length;
            if (legacySeedEnabled || passwordBytes < 12 || passwordBytes > 72) {
                throw new IllegalStateException("Disable the legacy demo seed and supply a local demo password (12–72 UTF-8 bytes).");
            }
            var resource = new ClassPathResource("db/demo/V28__standardize_demo_data.sql");
            try (var stream = resource.getInputStream()) {
                String sql = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
                new TransactionTemplate(transactions).executeWithoutResult(status -> {
                    trainingLock.acquire();
                    if (Boolean.TRUE.equals(jdbc.queryForObject("""
                            SELECT CONVERT(bit, CASE WHEN EXISTS (SELECT 1 FROM sys.extended_properties
                                WHERE class=0 AND name=?) THEN 1 ELSE 0 END)
                            """, Boolean.class, SEED_MARKER))) return;
                    var log = LoggerFactory.getLogger(StandardDemoDataConfig.class);
                    var entries = jdbc.query(sql, (row, index) -> {
                        String skipped = row.getString("skip_reason");
                        if (skipped != null) {
                            log.warn("Demo template skipped: {} (weekday {}, slot {}): {}", row.getString("name"),
                                    row.getInt("weekday"), row.getInt("slot"), skipped);
                            return null;
                        }
                        return new WeeklyScheduleService.Entry(row.getString("name"), row.getInt("sport_id"),
                                row.getInt("coach_id"), row.getInt("room_id"), row.getInt("capacity"),
                                Set.of(DayOfWeek.of(row.getInt("weekday"))),
                                FlexibleClassSlot.valueOf("SLOT_0" + row.getInt("slot")), row.getString("level"));
                    }, database, encoder.encode(password)).stream().filter(Objects::nonNull).toList();
                    LocalDate monday = LocalDate.now(clock.withZone(FlexibleClassSlot.ZONE))
                            .with(TemporalAdjusters.next(DayOfWeek.MONDAY));
                    if (!entries.isEmpty()) {
                        var preview = schedules.preview(new WeeklyScheduleService.Request(monday, 4, entries, Set.of(), null));
                        var excluded = preview.occurrences().stream()
                                .filter(row -> row.status() == WeeklyScheduleService.Status.CONFLICT)
                                .map(row -> {
                                    log.warn("Demo session skipped: {} ({} {}): {}", row.className(),
                                            row.date(), row.slotCode().start(), row.message());
                                    return row.key();
                                }).collect(Collectors.toSet());
                        if (!excluded.isEmpty()) {
                            preview = schedules.preview(new WeeklyScheduleService.Request(monday, 4, entries, excluded, null));
                        }
                        var result = schedules.confirm(new WeeklyScheduleService.Request(monday, 4, entries, excluded, preview.token()));
                        log.info("Demo schedule from {}: {} created, {} already exist, {} excluded",
                                monday, result.created(), result.alreadyExisted(), result.excluded());
                    }
                    jdbc.update("EXEC sys.sp_addextendedproperty @name=?, @value=?", SEED_MARKER, monday.toString());
                });
            }
        };
    }
}
