package com.sportscenter.management.audit;

import com.sportscenter.management.dto.Response.*;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

/** Capture only a typed identity, never serialize response/request payloads for audit. */
@RestControllerAdvice
public class AuditResponseAdvice implements ResponseBodyAdvice<Object> {
    static final String IDENTITY = AuditResponseAdvice.class.getName() + ".identity";
    record Identity(String type, Integer id) {}

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType contentType,
                                  Class<? extends HttpMessageConverter<?>> converterType,
                                  ServerHttpRequest request, ServerHttpResponse response) {
        if (request instanceof ServletServerHttpRequest servletRequest) {
            Identity identity = switch (body) {
                case RoomResponse value -> new Identity("ROOM", value.getId());
                case SportResponse value -> new Identity("SPORT", value.getId());
                case ClassResponse value -> new Identity("CLASS", value.getId());
                case BookingResponse value -> new Identity("BOOKING", value.getId());
                case AttendanceResponse value -> new Identity("ATTENDANCE", value.getId());
                case MembershipPackageResponse value -> new Identity("MEMBERSHIP_PACKAGE", value.getId());
                case MembershipOrderResponse value -> new Identity("MEMBERSHIP_ORDER", value.getId());
                case MemberSubscriptionResponse value -> new Identity("MEMBERSHIP", value.getId());
                case InvoiceResponse value -> new Identity("INVOICE", value.getId());
                case UserResponse value -> new Identity("USER", value.getId());
                case SupportTicketResponse value -> new Identity("SUPPORT_TICKET", value.getId());
                case WorkoutPlanResponse value -> new Identity("WORKOUT_PLAN", value.getId());
                case WorkoutLogResponse value -> new Identity("WORKOUT_LOG", value.getId());
                case FeedbackResponse value -> new Identity("FEEDBACK", value.getId());
                case null, default -> null;
            };
            if (identity != null && identity.id() != null) {
                servletRequest.getServletRequest().setAttribute(IDENTITY, identity);
            }
        }
        return body;
    }
}
