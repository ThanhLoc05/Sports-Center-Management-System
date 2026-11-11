package com.sportscenter.management.audit;

import com.sportscenter.management.controller.AuditLogController;
import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.AuditLogService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.annotation.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditLogServiceTest {
    @Test void capturedIdentityStillSavesAfterActorChangesEmail() {
        var logs = mock(AuditLogRepository.class);
        var users = mock(UserRepository.class);
        var actor = User.builder().id(6).email("before@example.test").build();
        when(users.findByEmail("before@example.test")).thenReturn(Optional.of(actor));
        when(users.findById(6)).thenReturn(Optional.of(actor));
        var service = new AuditLogService(logs, users);
        Integer id = service.resolveActorId("before@example.test");
        actor.setEmail("after@example.test");
        when(users.findByEmail("before@example.test")).thenReturn(Optional.empty());
        service.record(id, "UPDATE", "USER", 6, "127.0.0.1", "PUT /api/v1/users/6/profile");
        var capture = ArgumentCaptor.forClass(AuditLog.class);
        verify(logs).save(capture.capture());
        assertEquals(6, capture.getValue().getActor().getId());
        assertEquals("PUT /api/v1/users/6/profile", capture.getValue().getDetails());
        assertNull(capture.getValue().getOldValue());
        assertNull(capture.getValue().getNewValue());
        verify(users, times(1)).findByEmail("before@example.test");
        verify(users).findById(6);
    }
    @Test void savesOnlyIdentityAndMetadata() {
        var logs = mock(AuditLogRepository.class);
        var users = mock(UserRepository.class);
        var actor = User.builder().id(3).email("manager@example.test").build();
        when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
        new AuditLogService(logs, users).record(actor.getId(), "CREATE", "ROOM", 81,
                "127.0.0.1", "POST /api/v1/rooms");
        var capture = ArgumentCaptor.forClass(AuditLog.class);
        verify(logs).save(capture.capture());
        var saved = capture.getValue();
        assertSame(actor, saved.getActor());
        assertEquals(81, saved.getEntityId());
        assertEquals("CREATE", saved.getAction());
        assertEquals("ROOM", saved.getEntityType());
        assertEquals("POST /api/v1/rooms", saved.getDetails());
        assertNotNull(saved.getCreatedAt());
        assertNull(saved.getOldValue()); assertNull(saved.getNewValue());
    }
    @Configuration @EnableMethodSecurity static class SecurityConfig {
        @Bean AuditLogService service() { return mock(AuditLogService.class); }
        @Bean AuditLogController controller(AuditLogService service) { return new AuditLogController(service); }
    }
    @Test void onlyManagerCanReadDetailAndExportAndList() {
        try (var ctx = new AnnotationConfigApplicationContext(SecurityConfig.class)) {
            var controller = ctx.getBean(AuditLogController.class);
            for (String role : new String[]{"RECEPTIONIST", "COACH", "MEMBER"}) {
                SecurityContextHolder.getContext().setAuthentication(
                        new TestingAuthenticationToken("test", "unused", "ROLE_" + role));
                assertThrows(AccessDeniedException.class, () -> controller.get(1));
                assertThrows(AccessDeniedException.class, () -> controller.export(null,null,null,null,null,null,null));
                assertThrows(AccessDeniedException.class, () -> controller.list(null,null,null,null,null,null,null,0,25));
            }
            verifyNoInteractions(ctx.getBean(AuditLogService.class));
            SecurityContextHolder.getContext().setAuthentication(
                    new TestingAuthenticationToken("manager", "unused", "ROLE_CENTER_MANAGER"));
            controller.get(1);
            verify(ctx.getBean(AuditLogService.class)).get(1);
        } finally { SecurityContextHolder.clearContext(); }
    }
}
