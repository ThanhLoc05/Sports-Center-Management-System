package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.ClassRequest;
import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.CoachProfile;
import com.sportscenter.management.entity.Sport;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.service.SessionMembershipAccess;
import com.sportscenter.management.entity.Role;
import com.sportscenter.management.entity.Room;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.CoachProfileRepository;
import com.sportscenter.management.repository.RoomRepository;
import com.sportscenter.management.repository.SportRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.MemberClassNotifications;
import org.springframework.web.server.ResponseStatusException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import jakarta.persistence.EntityManager;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import com.sportscenter.management.service.FlexibleClassSlot;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;

class ClassServiceValidationTest {
    private final ClassRepository classes = mock(ClassRepository.class);
    private final ClassBookingRepository bookings = mock(ClassBookingRepository.class);
    private final SportRepository sports = mock(SportRepository.class);
    private final RoomRepository rooms = mock(RoomRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final CoachProfileRepository coachProfiles = mock(CoachProfileRepository.class);
    private final MemberClassNotifications notifications = mock(MemberClassNotifications.class);
    private final MemberSubscriptionRepository subscriptions = mock(MemberSubscriptionRepository.class);
    private final MembershipPackageRepository packages = mock(MembershipPackageRepository.class);
    private final ClassServiceImpl service = new ClassServiceImpl(classes, bookings, sports, rooms, users, coachProfiles,
            notifications, new SessionMembershipAccess(subscriptions, packages),
            mock(com.sportscenter.management.service.AuditLogService.class),
            mock(com.sportscenter.management.training.TrainingProgramService.class));

    @BeforeEach
    void injectPersistenceContext() {
        ReflectionTestUtils.setField(service, "entityManager", mock(EntityManager.class));
        when(classes.findByIdForUpdate(anyInt())).thenAnswer(call -> classes.findById(call.getArgument(0)));
    }

    @Test
    void updateRejectsCapacityAboveExistingRoomWhenRoomIsUnchanged() {
        Classes existing = Classes.builder()
                .id(1).className("Yoga").sportId(1).coachId(5).roomId(2)
                .maxCapacity(8).scheduleTime(LocalDateTime.now().plusDays(1))
                .durationMinutes(60).requiredAccessLevel("STANDARD").status("SCHEDULED")
                .build();
        when(classes.findById(1)).thenReturn(Optional.of(existing));
        when(bookings.countByClassIdAndStatus(1, "BOOKED")).thenReturn(3L);
        when(rooms.findById(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        ClassRequest request = ClassRequest.builder().maxCapacity(11).build();

        assertThrows(IllegalArgumentException.class, () -> service.updateClass(1, request));
        verify(classes, never()).save(any());
    }

    @Test
    void planningAndCreationRejectExplicitlyIncompatibleCoachOrRoom() {
        when(sports.existsById(2)).thenReturn(true);
        when(sports.findAll()).thenReturn(List.of(
                Sport.builder().id(1).sportName("Cầu lông").build(),
                Sport.builder().id(2).sportName("Yoga").build()));
        var coach = activeCoach(5);
        var room = Room.builder().id(2).roomName("Phòng Yoga – Balance").capacity(15).build();
        when(users.findById(5)).thenReturn(Optional.of(coach));
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(coach));
        when(rooms.findById(2)).thenReturn(Optional.of(room));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(room));
        when(coachProfiles.findById(5)).thenReturn(Optional.of(
                CoachProfile.builder().specialties("Cầu lông – kỹ thuật và di chuyển").build()));
        ClassRequest yoga = ClassRequest.builder().className("Yoga").sportId(2).coachId(5).roomId(2)
                .maxCapacity(6).scheduleTime(nextSlot(15, 0)).durationMinutes(90).build();

        assertTrue(assertThrows(IllegalArgumentException.class, () -> service.validatePlanningResources(yoga))
                .getMessage().contains("Chuyên môn"));
        assertTrue(assertThrows(IllegalArgumentException.class, () -> service.createClass(yoga))
                .getMessage().contains("Chuyên môn"));
        when(coachProfiles.findById(5)).thenReturn(Optional.of(
                CoachProfile.builder().specialties("Cầu lông và Hatha Yoga").build()));
        service.validatePlanningResources(yoga);
        room.setRoomName("Sân cầu lông A");
        assertTrue(assertThrows(IllegalArgumentException.class, () -> service.validatePlanningResources(yoga))
                .getMessage().contains("Sân/phòng"));
        verify(classes, never()).save(any());
    }

    @Test
    void createRejectsInactiveCoach() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(User.builder()
                .id(5)
                .role(Role.builder().roleName("COACH").build())
                .status("BLOCKED")
                .build()));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(nextSlot(15, 0)).durationMinutes(90)
                .build();

        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));

        verify(rooms, never()).findByIdForUpdate(any());
        verify(classes, never()).save(any());
    }

    @Test
    void createRejectsOverlappingScheduleOnSameCoach() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(classes.findPotentialScheduleConflicts(eq(5), eq(2), any()))
                .thenReturn(List.of(Classes.builder()
                        .id(9)
                        .className("Pilates")
                        .coachId(5)
                        .roomId(3)
                        .scheduleTime(nextSlot(14, 30))
                        .durationMinutes(60)
                        .status("SCHEDULED")
                        .build()));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(nextSlot(15, 0)).durationMinutes(90)
                .build();

        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));

        verify(classes, never()).save(any());
    }

    @Test
    void createUsesResourceLocksBeforeCheckingConflicts() {
        when(sports.existsById(1)).thenReturn(true);
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(classes.findPotentialScheduleConflicts(eq(5), eq(2), any())).thenReturn(List.of());
        when(classes.save(any(Classes.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ClassRequest request = ClassRequest.builder()
                .className("Yoga")
                .sportId(1)
                .coachId(5)
                .roomId(2)
                .maxCapacity(8)
                .scheduleTime(nextSlot(15, 0)).durationMinutes(90)
                .build();

        service.createClass(request);

        var order = inOrder(users, rooms, classes);
        order.verify(users).findByIdForUpdate(5);
        order.verify(rooms).findByIdForUpdate(2);
        order.verify(classes).findPotentialScheduleConflicts(eq(5), eq(2), any());
    }

    private Classes scheduledClass(LocalDateTime start) {
        var row = Classes.builder().id(1).className("Yoga").sportId(1).coachId(5).roomId(2)
                .maxCapacity(8).scheduleTime(start).durationMinutes(60).status("SCHEDULED").build();
        when(classes.findById(1)).thenReturn(Optional.of(row));
        when(rooms.findByIdForUpdate(2)).thenReturn(Optional.of(Room.builder().id(2).capacity(10).build()));
        when(users.findByIdForUpdate(5)).thenReturn(Optional.of(activeCoach(5)));
        when(classes.save(row)).thenReturn(row);
        return row;
    }

    @Test
    void rejectsDurationConflictBeforeMutatingOrPublishing() {
        LocalDateTime start = nextSlot(15, 0);
        Classes row = scheduledClass(start);
        when(bookings.findBookedMemberIds(1)).thenReturn(List.of(17, 21));
        when(bookings.hasMemberScheduleConflict(1, start, start.plusMinutes(90))).thenReturn(true);

        var conflict = assertThrows(ResponseStatusException.class, () -> service.updateClass(1,
                ClassRequest.builder().className("Renamed").durationMinutes(90).build()));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals(60, row.getDurationMinutes());
        assertEquals("Yoga", row.getClassName());
        var order = inOrder(classes, users, bookings);
        order.verify(classes).findByIdForUpdate(1);
        order.verify(users).findByIdForUpdate(17);
        order.verify(users).findByIdForUpdate(21);
        order.verify(bookings).hasMemberScheduleConflict(1, start, start.plusMinutes(90));
        verify(classes, never()).save(any());
        verifyNoInteractions(notifications);
    }

    @Test
    void unchangedIntervalCanUpdateDetailsWithoutRevalidatingExistingMemberBookings() {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        scheduledClass(start);
        var updated = service.updateClass(1, ClassRequest.builder()
                .className("Renamed").scheduleTime(start).durationMinutes(60).build());
        assertEquals("Renamed", updated.getClassName());
        verify(bookings, never()).findBookedMemberIds(anyInt());
        verify(bookings, never()).hasMemberScheduleConflict(anyInt(), any(), any());
    }

    @Test
    void newFlexibleSessionRequiresAnOfficialStartAndNinetyMinutes() {
        var request = ClassRequest.builder().sportId(1).coachId(5).roomId(2).maxCapacity(8)
                .className("Yoga").scheduleTime(nextSlot(15, 30)).durationMinutes(90).build();
        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));
        request.setScheduleTime(nextSlot(15, 0));
        request.setDurationMinutes(60);
        assertThrows(IllegalArgumentException.class, () -> service.createClass(request));
        verifyNoInteractions(rooms, users, classes);
    }

    @Test
    void updatingCourseSessionDoesNotApplyFlexibleTimeSlots() {
        LocalDateTime start = nextSlot(14, 0);
        scheduledClass(start).setCourseId(22);
        var moved = service.updateClass(1, ClassRequest.builder().scheduleTime(start.plusMinutes(15)).build());
        assertEquals(start.plusMinutes(15), moved.getScheduleTime());
        assertEquals(60, moved.getDurationMinutes());
    }

    @Test
    void movesFlexibleClassWhenMembershipCoversNewDateIncludingLastDay() {
        var original = nextSlot(15, 0);
        var target = original.plusDays(2);
        var row = scheduledClass(original);
        when(bookings.findBookedMemberIds(1)).thenReturn(List.of(17, 21));
        plan(17, target.toLocalDate(), target.toLocalDate());
        plan(21, target.toLocalDate(), target.toLocalDate().plusDays(4));

        var saved = service.updateClass(1, ClassRequest.builder().scheduleTime(target).durationMinutes(90).build());

        assertEquals(target, saved.getScheduleTime());
        verify(classes).save(row);
        verify(notifications).changed(any(), same(row));
    }

    @Test
    void blocksMoveAfterOnlyBookedMembersMembershipExpires() {
        assertBlockedMembershipMove(List.of(17), 17);
    }

    @Test
    void blocksMoveWhenOnlyOneOfSeveralBookedMembersMembershipsExpires() {
        assertBlockedMembershipMove(List.of(17, 21), 21);
    }

    private void assertBlockedMembershipMove(List<Integer> members, int expired) {
        var original = nextSlot(15, 0);
        var target = original.plusDays(2);
        var row = scheduledClass(original);
        when(bookings.findBookedMemberIds(1)).thenReturn(members);
        for (int member : members) {
            plan(member, target.toLocalDate(), member == expired
                    ? target.toLocalDate().minusDays(1) : target.toLocalDate());
        }

        var conflict = assertThrows(ResponseStatusException.class, () -> service.updateClass(1,
                ClassRequest.builder().scheduleTime(target).durationMinutes(90).className("Changed").build()));

        assertEquals(409, conflict.getStatusCode().value());
        assertTrue(conflict.getReason().contains("#" + expired));
        assertEquals(original, row.getScheduleTime());
        assertEquals(60, row.getDurationMinutes());
        assertEquals("Yoga", row.getClassName());
        verify(classes, never()).save(any());
        verifyNoInteractions(notifications);
    }

    private void plan(int memberId, LocalDate target, LocalDate expires) {
        var subscription = MemberSubscription.builder().memberId(memberId).packageId(2).entitlementLevel("STANDARD")
                .selectedSportId(1).startDate(target.minusDays(5)).endDate(expires).status("ACTIVE").build();
        when(subscriptions.findFirstByMemberIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateDescIdDesc(
                memberId, "ACTIVE", target, target)).thenReturn(target.isAfter(expires) ? Optional.empty() : Optional.of(subscription));
        when(packages.findById(2)).thenReturn(Optional.of(MembershipPackage.builder().id(2).accessLevel("STANDARD").build()));
    }

    private LocalDateTime nextSlot(int hour, int minute) {
        return LocalDate.now(FlexibleClassSlot.ZONE).plusDays(1).atTime(hour, minute);
    }

    private User activeCoach(int id) {
        return User.builder()
                .id(id)
                .role(Role.builder().roleName("COACH").build())
                .status("ACTIVE")
                .build();
    }
}
