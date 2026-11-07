package com.sportscenter.management.audit;

import com.sportscenter.management.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.mockito.Mockito.*;

class AuditLogInterceptorTest {

    private final AuditLogService auditLogService = mock(AuditLogService.class);
    private final AuditLogInterceptor interceptor = new AuditLogInterceptor(auditLogService);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void recordsSuccessfulAuthenticatedMutationsWithoutRequestPayload() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        "manager@example.test", "n/a", List.of()));
        HttpServletRequest request = request("PATCH", "/api/v1/users/4/status");
        HttpServletResponse response = response(200);

        interceptor.afterCompletion(request, response, null, null);

        verify(auditLogService).record(
                "manager@example.test", "STATUS_CHANGE", "USER", 4,
                "127.0.0.1", "PATCH /api/v1/users/4/status");
    }

    @Test
    void skipsFailedMutationsAndAuthenticationRoutes() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                        "manager@example.test", "n/a", List.of()));
        interceptor.afterCompletion(request("POST", "/api/v1/classes"), response(400), null, null);
        interceptor.afterCompletion(request("POST", "/api/v1/users/login"), response(200), null, null);

        verifyNoInteractions(auditLogService);
    }

    private static HttpServletRequest request(String method, String path) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getMethod()).thenReturn(method);
        when(request.getRequestURI()).thenReturn(path);
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        return request;
    }

    private static HttpServletResponse response(int status) {
        HttpServletResponse response = mock(HttpServletResponse.class);
        when(response.getStatus()).thenReturn(status);
        return response;
    }
}
