package com.sportscenter.management.audit;

import com.sportscenter.management.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class AuditLogInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(AuditLogInterceptor.class);
    private static final Set<String> IGNORED_PATHS = Set.of(
            "/api/v1/users/login",
            "/api/v1/users/register",
            "/api/v1/users/verify-email",
            "/api/v1/users/resend-verification",
            "/api/v1/users/forgot-password",
            "/api/v1/users/reset-password",
            "/api/v1/payments/webhooks/sepay"
    );
    private static final Map<String, String> ENTITY_TYPES = Map.ofEntries(
            Map.entry("users", "USER"),
            Map.entry("classes", "CLASS"),
            Map.entry("bookings", "BOOKING"),
            Map.entry("attendance", "ATTENDANCE"),
            Map.entry("memberships", "MEMBERSHIP"),
            Map.entry("membership-orders", "MEMBERSHIP_ORDER"),
            Map.entry("payments", "INVOICE"),
            Map.entry("sports", "SPORT"),
            Map.entry("rooms", "ROOM"),
            Map.entry("support-tickets", "SUPPORT_TICKET"),
            Map.entry("workout-plans", "WORKOUT_PLAN"),
            Map.entry("workout-logs", "WORKOUT_LOG"),
            Map.entry("feedbacks", "FEEDBACK")
    );

    private final AuditLogService auditLogService;

    private static final String ACTOR_ID = AuditLogInterceptor.class.getName() + ".actorId";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String path = request.getRequestURI();
        String[] parts = path.split("/");
        if (path.startsWith("/api/v1/") && parts.length >= 4 && ENTITY_TYPES.containsKey(parts[3])
                && !IGNORED_PATHS.contains(path)
                && Set.of("POST", "PUT", "PATCH", "DELETE").contains(request.getMethod())) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
                try {
                    // Email is mutable: resolve the authenticated actor before the controller runs.
                    // Never derive this identity from the target URL, request body or response token.
                    Integer id = auditLogService.resolveActorId(auth.getName());
                    if (id != null) request.setAttribute(ACTOR_ID, id);
                } catch (RuntimeException failure) {
                    log.error("Could not resolve audit actor ({})", failure.getClass().getSimpleName());
                }
            }
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception exception) {
        String path = request.getRequestURI();
        if (exception != null || response.getStatus() < 200 || response.getStatus() >= 300
                || IGNORED_PATHS.contains(path)
                || !path.startsWith("/api/v1/")
                || !Set.of("POST", "PUT", "PATCH", "DELETE").contains(request.getMethod())) {
            return;
        }

        String[] parts = path.split("/");
        if (parts.length < 4) return;
        String resource = parts[3];
        String entityType = ENTITY_TYPES.get(resource);
        if (entityType == null) return;
        if ("classes".equals(resource) && Arrays.asList(parts).contains("book")) {
            entityType = "BOOKING";
        } else if ("memberships".equals(resource)) {
            if (Arrays.asList(parts).contains("packages")) {
                entityType = "MEMBERSHIP_PACKAGE";
            } else {
                entityType = "MEMBERSHIP";
            }
        } else if ("payments".equals(resource) && Arrays.asList(parts).contains("webhooks")) {
            return;
        }

        Object capturedActor = request.getAttribute(ACTOR_ID);
        if (!(capturedActor instanceof Integer actorId)) return;

        String action = actionFor(request.getMethod(), parts);
        // Nested create URLs can contain a parent ID (e.g. classes/{id}/book).
        // A known response DTO identifies the mutated entity, not its parent.
        Object identity = request.getAttribute(AuditResponseAdvice.IDENTITY);
        Integer entityId = identity instanceof AuditResponseAdvice.Identity value
                && entityType.equals(value.type()) ? value.id() : null;
        if (entityId == null && !("POST".equals(request.getMethod()) && "CREATE".equals(action))) {
            entityId = Arrays.stream(parts)
                    .filter(segment -> segment.matches("\\d{1,10}"))
                    .mapToLong(Long::parseLong)
                    .filter(id -> id <= Integer.MAX_VALUE)
                    .mapToObj(id -> (int) id)
                    .reduce((first, second) -> second)
                    .orElse(null);
        }
        String requestPath = request.getMethod() + " " + path;
        String ipAddress = request.getRemoteAddr();
        if (ipAddress != null && ipAddress.length() > 45) ipAddress = ipAddress.substring(0, 45);

        try {
            auditLogService.record(actorId, action, entityType,
                    entityId, ipAddress, requestPath);
        } catch (RuntimeException auditFailure) {
            // Database exception messages may include values; do not log their payloads.
            log.error("Could not persist audit record for {} {} ({})", request.getMethod(), path,
                    auditFailure.getClass().getSimpleName());
        }
    }

    private static String actionFor(String method, String[] pathParts) {
        String finalSegment = pathParts[pathParts.length - 1];
        return switch (finalSegment) {
            case "cancel" -> "CANCEL";
            case "confirm-payment" -> "CONFIRM_PAYMENT";
            case "pay" -> "PAYMENT";
            case "refund" -> "REFUND";
            case "resolve" -> "RESOLVE";
            case "renew" -> "RENEW";
            case "status" -> "STATUS_CHANGE";
            case "role" -> "ROLE_CHANGE";
            default -> switch (method) {
                case "POST" -> "CREATE";
                case "PUT", "PATCH" -> "UPDATE";
                case "DELETE" -> "DELETE";
                default -> "UPDATE";
            };
        };
    }
}
