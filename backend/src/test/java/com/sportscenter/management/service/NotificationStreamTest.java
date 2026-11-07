package com.sportscenter.management.service;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.controller.NotificationController;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.GeneralNotificationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Map;
import java.util.Set;
import java.io.IOException;
import jakarta.servlet.AsyncEvent;
import org.springframework.mock.web.MockAsyncContext;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class NotificationStreamTest {
    @Test
    void subscriptionFlushesOnlyConnectionCommentWithoutBusinessWrites() throws Exception {
        var security = mock(SecurityUtils.class);
        var users = mock(UserRepository.class);
        var classes = mock(ClassRepository.class);
        var bookings = mock(ClassBookingRepository.class);
        var plans = mock(WorkoutPlanService.class);
        var history=mock(GeneralNotificationRepository.class);
        var service = new NotificationDeliveryService(security, users, classes, bookings, plans, history);
        when(security.getCurrentUserId()).thenReturn(15);
        var mvc = MockMvcBuilders.standaloneSetup(new NotificationController(service, security, mock(GeneralNotificationHistory.class))).build();

        var result = mvc.perform(get("/api/v1/notifications/stream")
                        .accept(MediaType.TEXT_EVENT_STREAM))
                .andExpect(status().isOk())
                .andExpect(request().asyncStarted())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM))
                .andReturn();

        assertTrue(result.getResponse().isCommitted(), "First frame must flush response headers");
        assertEquals(":connected\n\n", result.getResponse().getContentAsString());
        var subscribers = (Map<?, ?>) ReflectionTestUtils.getField(service, "subscribers");
        assertNotNull(subscribers);
        assertEquals(Set.of(15), subscribers.keySet());
        assertEquals(1, ((Set<?>) subscribers.get(15)).size());
        verifyNoInteractions(users, classes, bookings, plans);
        var async = (MockAsyncContext) result.getRequest().getAsyncContext();
        for (var listener : async.getListeners()) {
            listener.onError(new AsyncEvent(async, new IOException("Test client disconnected")));
        }
        assertTrue(subscribers.isEmpty(), "Transport error must remove the registered emitter");
    }
}
