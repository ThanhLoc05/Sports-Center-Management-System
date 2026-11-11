package com.sportscenter.management.service;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Repeat the same real SQL/HTTP race with the application's default OSIV persistence context. */
class ProfileJwtOsivSqlServerIT extends ProfileJwtConcurrencySqlServerIT {
    @Autowired Environment environment;
    @DynamicPropertySource static void osiv(DynamicPropertyRegistry registry) {
        registry.add("spring.jpa.open-in-view", () -> "true");
    }
    @BeforeEach void assertOsivEnabled() {
        assertTrue(environment.getProperty("spring.jpa.open-in-view", Boolean.class, false));
    }
}
