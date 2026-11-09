package com.sportscenter.management.audit;

import com.sportscenter.SportsCenterApplication;
import com.sportscenter.management.controller.RoomController;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.AuditLogService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.time.LocalDateTime;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Explicit opt-in; SQL Server schema must already exist. Never initializes or drops a database. */
@EnabledIfSystemProperty(named="sportiva.audit-sqlserver", matches="true")
@SpringBootTest(classes=SportsCenterApplication.class, properties={
        "spring.datasource.url=jdbc:sqlserver://DESKTOP-IKVPEK1;instanceName=SQLEXPRESS;databaseName=SportivaRoomRace_20261109;integratedSecurity=true;encrypt=true;trustServerCertificate=true;applicationName=SportivaAuditIT",
        "spring.datasource.username=", "spring.datasource.password=", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.sql.init.mode=never", "spring.flyway.enabled=false", "spring.liquibase.enabled=false"})
class AuditLogSqlServerIT {
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired RoomController rooms;
    @Autowired AuditLogService service;
    @Autowired AuditResponseAdvice advice;
    @Autowired AuditLogInterceptor interceptor;

    @AfterEach void logout() { SecurityContextHolder.clearContext(); }

    @Test void successfulMvcCreateAndUpdatePersistCorrectMetadataWhileFailuresDoNot() throws Exception {
        assertEquals("DESKTOP-IKVPEK1\\SQLEXPRESS|SportivaRoomRace_20261109",
                jdbc.queryForObject("SELECT CONVERT(varchar(128),@@SERVERNAME)+'|'+DB_NAME()", String.class));
        String marker = "audit-it-" + UUID.randomUUID();
        // Optional ephemeral credential allows a separate browser smoke test on this isolated DB.
        // It must never be printed or saved in source/evidence.
        String password = System.getenv("SPORTIVA_AUDIT_TEST_PASSWORD");
        User actor = users.saveAndFlush(User.builder().email(marker + "@example.test").phone(marker)
                .fullName("Audit integration fixture").passwordHash(password == null
                        ? "not-a-login-credential" : new BCryptPasswordEncoder().encode(password))
                .role(roles.findByRoleName("CENTER_MANAGER").orElseThrow())
                .status("ACTIVE").createdAt(LocalDateTime.now()).build());
        SecurityContextHolder.getContext().setAuthentication(
                new TestingAuthenticationToken(actor.getEmail(), "unused", "ROLE_CENTER_MANAGER"));
        var mvc = MockMvcBuilders.standaloneSetup(rooms).setControllerAdvice(advice)
                .addInterceptors(interceptor).build();
        mvc.perform(post("/api/v1/rooms").contentType("application/json")
                .content("{\"roomName\":\"" + marker + "\",\"capacity\":3}"))
                .andExpect(status().isCreated());
        int roomId = jdbc.queryForObject("SELECT room_id FROM rooms WHERE room_name=?", Integer.class, marker);
        var create = jdbc.queryForMap("SELECT entity_id,action,entity_type,details,old_value,new_value FROM audit_logs WHERE actor_id=?", actor.getId());
        assertEquals(roomId, create.get("entity_id"));
        assertEquals("CREATE", create.get("action"));
        assertEquals("ROOM", create.get("entity_type"));
        assertEquals("POST /api/v1/rooms", create.get("details"));
        assertNull(create.get("old_value")); assertNull(create.get("new_value"));
        mvc.perform(put("/api/v1/rooms/" + roomId).contentType("application/json")
                .content("{\"roomName\":\"" + marker + "\",\"capacity\":4}"))
                .andExpect(status().isOk());
        assertEquals(4, jdbc.queryForObject("SELECT capacity FROM rooms WHERE room_id=?", Integer.class, roomId));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_id=? AND entity_id=? AND action='UPDATE'", Integer.class, actor.getId(), roomId));
        mvc.perform(post("/api/v1/rooms").contentType("application/json")
                .content("{\"roomName\":\"invalid\",\"capacity\":0}"))
                .andExpect(status().isBadRequest());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE actor_id=?", Integer.class, actor.getId()));
        assertEquals(roomId, service.search(actor.getId(), "CREATE", "ROOM", roomId,
                null,null,null,org.springframework.data.domain.PageRequest.of(0,25))
                .getContent().getFirst().getEntityId());
    }
}
