package com.sportscenter.management.service;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.NotificationSendRequest;
import com.sportscenter.management.dto.Response.WorkoutPlanResponse;
import com.sportscenter.management.entity.ClassBooking;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.repository.GeneralNotificationRepository;
import com.sportscenter.management.entity.GeneralNotification;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NotificationDeliveryServiceTest {
    @Test
    void heartbeatIsACommentAndNeverPersistsBusinessData() throws Exception {
        when(security.getCurrentUserId()).thenReturn(2);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.sportscenter.management.controller.NotificationController(service,security,mock(GeneralNotificationHistory.class))).build();
        var stream=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/notifications/stream")).andReturn();
        service.heartbeat();
        assertEquals(":connected\n\n:keepalive\n\n",stream.getResponse().getContentAsString());
        verifyNoInteractions(history,plans,users,classes,bookings);
        var async=(org.springframework.mock.web.MockAsyncContext)stream.getRequest().getAsyncContext();
        for(var listener:async.getListeners())listener.onError(new jakarta.servlet.AsyncEvent(async,new java.io.IOException("Test disconnect")));
        var subscribers=(java.util.Map<?,?>)org.springframework.test.util.ReflectionTestUtils.getField(service,"subscribers");
        org.junit.jupiter.api.Assertions.assertTrue(subscribers.isEmpty());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans={true,false})
    void persistedGeneralIsPublishedOnlyAfterCommit(boolean committed) throws Exception {
        when(security.getCurrentUserId()).thenReturn(2);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                new com.sportscenter.management.controller.NotificationController(service,security,mock(GeneralNotificationHistory.class))).build();
        var stream=mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/v1/notifications/stream")).andReturn();
        when(security.getCurrentUserId()).thenReturn(1);
        when(security.isCenterManager()).thenReturn(true);
        when(users.findById(2)).thenReturn(Optional.of(user(2,"MEMBER","ACTIVE")));
        org.springframework.transaction.support.TransactionSynchronizationManager.initSynchronization();
        try {
            service.send(request(List.of(2),"GENERAL",null));
            assertEquals(":connected\n\n",stream.getResponse().getContentAsString());
            var sync=org.springframework.transaction.support.TransactionSynchronizationManager.getSynchronizations();
            assertEquals(1,sync.size());
            if(committed)sync.getFirst().afterCommit();
            else sync.getFirst().afterCompletion(org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK);
            assertEquals(committed,stream.getResponse().getContentAsString().contains("id:99"));
            verify(history).save(argThat(n->n.getId()==99L));
        } finally { org.springframework.transaction.support.TransactionSynchronizationManager.clearSynchronization(); }
    }

    private final SecurityUtils security = mock(SecurityUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final WorkoutPlanService plans = mock(WorkoutPlanService.class);
    private final GeneralNotificationRepository history = mock(GeneralNotificationRepository.class);
    private final NotificationDeliveryService service =
            new NotificationDeliveryService(security, users, classes, bookings, plans, history);

    @org.junit.jupiter.api.BeforeEach
    void savedGeneralIds() {
        when(history.save(any())).thenAnswer(call -> { GeneralNotification n=call.getArgument(0);n.setId(99L);return n; });
    }

    @Test
    void managerCanSendTemporaryNoticeToActiveMember() {
        when(security.getCurrentUserId()).thenReturn(1);
        when(security.isCenterManager()).thenReturn(true);
        when(users.findById(2)).thenReturn(Optional.of(user(2, "MEMBER", "ACTIVE")));

        var result = service.send(request(List.of(2), "GENERAL", null));

        assertEquals(1, result.getAcceptedRecipients());
        assertEquals(0, result.getOnlineRecipientsAtSend());
        assertEquals(List.of(), result.getWorkoutPlanIds());
        verifyNoInteractions(plans);
        verify(history).save(argThat(n -> n.getSenderId().equals(1) && n.getRecipientId().equals(2) && n.getReadAt()==null));
    }

    @Test
    void homeworkIsSavedAsWorkoutPlanWithoutNotificationEntity() {
        when(security.getCurrentUserId()).thenReturn(1);
        when(security.isCenterManager()).thenReturn(true);
        when(users.findById(2)).thenReturn(Optional.of(user(2, "MEMBER", "ACTIVE")));
        when(plans.createPlan(any())).thenReturn(
                WorkoutPlanResponse.builder().id(77).build());

        var result = service.send(request(List.of(2), "HOMEWORK", 3));

        assertEquals(List.of(77), result.getWorkoutPlanIds());
        verifyNoInteractions(history);
        verify(plans).createPlan(argThat(plan ->
                plan.getCoachId().equals(3)
                        && plan.getMemberId().equals(2)
                        && plan.getTitle().equals("Bài tập tuần này")
                        && plan.getDescription().equals("Hoàn thành bài tập tại nhà")));
    }

    @Test
    void coachCannotSendToMemberOutsideAssignedClasses() {
        when(security.getCurrentUserId()).thenReturn(5);
        when(security.isCoach()).thenReturn(true);
        when(classes.findByCoachId(5)).thenReturn(List.of(Classes.builder().id(20).build()));
        when(bookings.findByClassId(20)).thenReturn(List.of(
                ClassBooking.builder().memberId(2).status("BOOKED").build()));
        when(users.findById(3)).thenReturn(Optional.of(user(3, "MEMBER", "ACTIVE")));

        assertThrows(AccessDeniedException.class,
                () -> service.send(request(List.of(3), "GENERAL", null)));
        verifyNoInteractions(plans);
    }

    @Test
    void nonMemberRecipientIsRejected() {
        when(security.getCurrentUserId()).thenReturn(1);
        when(security.isCenterManager()).thenReturn(true);
        when(users.findById(2)).thenReturn(Optional.of(user(2, "COACH", "ACTIVE")));

        assertThrows(IllegalArgumentException.class,
                () -> service.send(request(List.of(2), "GENERAL", null)));
    }

    private static NotificationSendRequest request(
            List<Integer> recipientIds, String kind, Integer coachId) {
        return NotificationSendRequest.builder()
                .recipientIds(recipientIds)
                .title("Bài tập tuần này")
                .content("Hoàn thành bài tập tại nhà")
                .kind(kind)
                .coachId(coachId)
                .build();
    }

    private static User user(int id, String role, String status) {
        return User.builder()
                .id(id)
                .role(Role.builder().roleName(role).build())
                .status(status)
                .build();
    }
}
