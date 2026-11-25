package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.*;
import com.sportscenter.management.repository.*;
import com.sportscenter.management.service.FlexibleBookingPolicy;
import com.sportscenter.management.service.MemberClassNotifications;
import com.sportscenter.management.service.MemberReminderService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class FlexibleBookingServiceTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 24, 10, 0);
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final MemberSubscriptionRepository subscriptions = mock(MemberSubscriptionRepository.class);
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final FlexibleBookingPolicy policy = mock(FlexibleBookingPolicy.class);
    private final MemberClassNotifications notifications = mock(MemberClassNotifications.class);
    private final BookingServiceImpl service = new BookingServiceImpl(classes, bookings, users,
            mock(MemberProfileRepository.class), subscriptions, packages, mock(MemberReminderService.class),
            notifications, mock(EntityManager.class), policy, mock(com.sportscenter.management.training.TrainingAccessService.class));

    @BeforeEach void setup() {
        var role = new Role();
        role.setRoleName("MEMBER");
        when(users.findByIdForUpdate(4)).thenReturn(Optional.of(User.builder().id(4).status("ACTIVE").role(role).build()));
        when(policy.now()).thenReturn(NOW);
        when(policy.holdingLimit(4,5)).thenReturn(5);
        when(packages.findById(8)).thenReturn(Optional.of(MembershipPackage.builder().id(8).accessLevel("STANDARD").build()));
        when(bookings.saveAndFlush(any(ClassBooking.class))).thenAnswer(invocation -> {
            var saved = invocation.getArgument(0, ClassBooking.class);
            saved.setId(1);
            return saved;
        });
    }

    private void session(int id, int sport, LocalDateTime start) {
        var clazz = Classes.builder().id(id).sportId(sport).status("SCHEDULED")
                .scheduleTime(start).durationMinutes(60).maxCapacity(10).requiredAccessLevel("STANDARD").build();
        when(classes.findByIdForUpdate(id)).thenReturn(Optional.of(clazz));
        when(classes.findById(id)).thenReturn(Optional.of(clazz));
        when(policy.available(clazz,4)).thenReturn(1);
    }

    private void period(String tier, Integer sport, LocalDateTime at) {
        when(subscriptions.findFirstByMemberIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateDescIdDesc(
                4,"ACTIVE",at.toLocalDate(),at.toLocalDate()))
                .thenReturn(Optional.of(MemberSubscription.builder().packageId(8).entitlementLevel(tier).selectedSportId(sport).build()));
    }

    @Test void standardAllowsSelectedSportAndRejectsAnother() {
        session(1,1,NOW.plusHours(2));
        session(2,2,NOW.plusHours(4));
        period("STANDARD",1,NOW);
        assertEquals(1, service.bookClass(1,4).getClassId());
        assertThrows(ResponseStatusException.class, () -> service.bookClass(2,4));
        verify(bookings, times(1)).saveAndFlush(any());
    }

    @Test void vipCanBookBothSports() {
        session(1,1,NOW.plusHours(2));
        session(2,2,NOW.plusHours(4));
        period("VIP",null,NOW);
        assertEquals(List.of(1,2), service.bookClasses(List.of(1,2),4).stream().map(b -> b.getClassId()).toList());
    }

    @Test void legacyStandardNeedsSelectionAndPastMembershipDoesNotQualify() {
        session(1,1,NOW.plusHours(2));
        period("STANDARD",null,NOW);
        assertThrows(ResponseStatusException.class, () -> service.bookClass(1,4));
        session(2,1,NOW.plusDays(2));
        assertThrows(IllegalArgumentException.class, () -> service.bookClass(2,4));
        verify(bookings, never()).saveAndFlush(any());
    }

    @Test void completedTimeFreesAHoldAndPastWeekDoesNotLimitAttendance() {
        session(1,1,NOW.plusDays(1));
        period("STANDARD",1,NOW.plusDays(1));
        var active = new ArrayList<ClassBooking>();
        for (int id = 10; id < 16; id++) {
            session(id,1,NOW.minusDays(id - 9L));
            active.add(ClassBooking.builder().classId(id).memberId(4).status("BOOKED").build());
        }
        for (int id = 20; id < 25; id++) {
            session(id,1,id == 20 ? NOW.minusMinutes(30) : NOW.plusHours(id - 19L));
            active.add(ClassBooking.builder().classId(id).memberId(4).status("BOOKED").build());
        }
        when(bookings.findByMemberId(4)).thenReturn(active);
        assertThrows(ResponseStatusException.class, () -> service.bookClass(1,4));
        session(20,1,NOW.minusHours(2));
        assertEquals(1, service.bookClass(1,4).getClassId());
    }

    @Test void restrictedMemberCannotCreateThirdHold() {
        session(1,1,NOW.plusHours(8));
        session(2,1,NOW.plusHours(2));
        session(3,1,NOW.plusHours(4));
        period("VIP",null,NOW);
        when(policy.holdingLimit(4,5)).thenReturn(2);
        when(bookings.findByMemberId(4)).thenReturn(List.of(
                ClassBooking.builder().classId(2).status("BOOKED").build(),
                ClassBooking.builder().classId(3).status("BOOKED").build()));
        assertThrows(ResponseStatusException.class, () -> service.bookClass(1,4));
    }

    @Test void rejectsOutsideSevenDaysAndDuplicateSelection() {
        session(1,1,NOW.plusDays(7).plusSeconds(1));
        assertThrows(ResponseStatusException.class, () -> service.bookClass(1,4));
        assertThrows(IllegalArgumentException.class, () -> service.bookClasses(List.of(1,1),4));
        verify(bookings, never()).saveAndFlush(any());
    }
}
