package com.sportscenter.management.config;

import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.jdbc.datasource.init.ScriptException;
import org.springframework.jdbc.datasource.init.ScriptUtils;

import javax.sql.DataSource;

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.demo.flow4.enabled", havingValue = "true", matchIfMissing = true)
class Flow4DemoDataConfig {
    @Bean
    ApplicationRunner prepareFlow4Demo(DataSource dataSource) {
        var resource = new ClassPathResource("db/demo-flow4-20261121.sql");
        var populator = new ResourceDatabasePopulator(resource);
        populator.setSqlScriptEncoding("UTF-8");
        populator.setSeparator(ScriptUtils.EOF_STATEMENT_SEPARATOR);

        return args -> {
            try {
                populator.execute(dataSource);
            } catch (ScriptException exception) {
                LoggerFactory.getLogger(Flow4DemoDataConfig.class)
                        .warn("Không nạp được lịch demo Flow 4 ngày 21/11/2026", exception);
            }
        };
    }
}
