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
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class NotificationDeliveryServiceTest {

    private final SecurityUtils security = mock(SecurityUtils.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final WorkoutPlanService plans = mock(WorkoutPlanService.class);
    private final NotificationDeliveryService service =
            new NotificationDeliveryService(security, users, classes, bookings, plans);

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
