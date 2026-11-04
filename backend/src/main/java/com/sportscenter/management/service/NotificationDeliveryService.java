package com.sportscenter.management.service;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.NotificationSendRequest;
import com.sportscenter.management.dto.Request.WorkoutPlanRequest;
import com.sportscenter.management.dto.Response.NotificationEventResponse;
import com.sportscenter.management.dto.Response.NotificationSendResponse;
import com.sportscenter.management.entity.ClassBooking;
import com.sportscenter.management.entity.User;
import com.sportscenter.management.repository.ClassBookingRepository;
import com.sportscenter.management.repository.ClassRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationDeliveryService {

    private static final String MEMBER_ROLE = "MEMBER";
    private static final String HOMEWORK_KIND = "HOMEWORK";

    private final SecurityUtils securityUtils;
    private final UserRepository userRepository;
    private final ClassRepository classRepository;
    private final ClassBookingRepository bookingRepository;
    private final WorkoutPlanService workoutPlanService;

    private final ConcurrentMap<Integer, Set<SseEmitter>> subscribers = new ConcurrentHashMap<>();
    private final AtomicLong eventIds = new AtomicLong();

    public SseEmitter subscribe(Integer userId) {
        SseEmitter emitter = new SseEmitter(0L);
        subscribers.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet()).add(emitter);

        Runnable remove = () -> removeSubscriber(userId, emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(error -> remove.run());
        return emitter;
    }

    @Transactional
    public NotificationSendResponse send(NotificationSendRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin thông báo không được để trống");
        }

        Integer senderId = securityUtils.getCurrentUserId();
        boolean manager = securityUtils.isCenterManager();
        boolean coach = securityUtils.isCoach();
        if (senderId == null || (!manager && !coach)) {
            throw new AccessDeniedException("Chỉ quản lý hoặc huấn luyện viên được gửi thông báo");
        }

        String title = requiredText(request.getTitle(), 150, "Tiêu đề");
        String content = requiredText(request.getContent(), 4000, "Nội dung");
        String kind = normalizeKind(request.getKind());
        String link = normalizeLink(request.getLink());
        List<Integer> recipientIds = normalizeRecipients(request.getRecipientIds());

        List<User> recipients = recipientIds.stream()
                .map(this::requireActiveMember)
                .toList();
        if (coach) {
            validateCoachRecipients(senderId, recipientIds);
        }

        List<Integer> planIds = new ArrayList<>();
        if (HOMEWORK_KIND.equals(kind)) {
            Integer planCoachId = coach ? senderId : request.getCoachId();
            if (planCoachId == null) {
                throw new IllegalArgumentException("Cần chọn huấn luyện viên phụ trách bài tập");
            }
            for (User recipient : recipients) {
                WorkoutPlanRequest planRequest = WorkoutPlanRequest.builder()
                        .title(title)
                        .description(content)
                        .coachId(planCoachId)
                        .memberId(recipient.getId())
                        .build();
                planIds.add(workoutPlanService.createPlan(planRequest).getId());
            }
        }

        LocalDateTime createdAt = LocalDateTime.now();
        List<NotificationEventResponse> events = recipients.stream()
                .map(recipient -> NotificationEventResponse.builder()
                        .id(eventIds.incrementAndGet())
                        .recipientId(recipient.getId())
                        .senderId(senderId)
                        .title(title)
                        .content(content)
                        .createdAt(createdAt)
                        .link(link)
                        .kind(kind)
                        .build())
                .toList();

        int onlineRecipients = (int) recipients.stream()
                .map(User::getId)
                .filter(this::hasSubscribers)
                .count();
        dispatchAfterCommit(events);

        return NotificationSendResponse.builder()
                .acceptedRecipients(recipients.size())
                .onlineRecipientsAtSend(onlineRecipients)
                .workoutPlanIds(List.copyOf(planIds))
                .build();
    }

    private User requireActiveMember(Integer memberId) {
        if (memberId == null || memberId < 1) {
            throw new IllegalArgumentException("Mã học viên không hợp lệ");
        }
        User member = userRepository.findById(memberId)
                .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy học viên"));
        if (member.getRole() == null || !MEMBER_ROLE.equals(member.getRole().getRoleName())
                || !"ACTIVE".equals(member.getStatus())) {
            throw new IllegalArgumentException("Người nhận phải là tài khoản MEMBER đang hoạt động");
        }
        return member;
    }

    private void validateCoachRecipients(Integer coachId, List<Integer> recipientIds) {
        Set<Integer> assignedMembers = new LinkedHashSet<>();
        classRepository.findByCoachId(coachId).forEach(clazz ->
                bookingRepository.findByClassId(clazz.getId()).stream()
                        .filter(booking -> "BOOKED".equals(booking.getStatus()))
                        .map(ClassBooking::getMemberId)
                        .forEach(assignedMembers::add));

        if (!assignedMembers.containsAll(recipientIds)) {
            throw new AccessDeniedException(
                    "HLV chỉ được gửi cho học viên đang có booking ở lớp mình phụ trách");
        }
    }

    private List<Integer> normalizeRecipients(List<Integer> input) {
        if (input == null || input.isEmpty() || input.size() > 100) {
            throw new IllegalArgumentException("Chọn từ 1 đến 100 học viên nhận thông báo");
        }
        LinkedHashSet<Integer> unique = new LinkedHashSet<>(input);
        if (unique.contains(null) || unique.stream().anyMatch(id -> id < 1)) {
            throw new IllegalArgumentException("Mã học viên không hợp lệ");
        }
        return List.copyOf(unique);
    }

    private String normalizeKind(String input) {
        String kind = input == null || input.isBlank()
                ? "GENERAL"
                : input.trim().toUpperCase();
        if (!"GENERAL".equals(kind) && !HOMEWORK_KIND.equals(kind)) {
            throw new IllegalArgumentException("Loại thông báo chỉ nhận GENERAL hoặc HOMEWORK");
        }
        return kind;
    }

    private String requiredText(String value, int maxLength, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " không được để trống");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(label + " vượt quá " + maxLength + " ký tự");
        }
        return normalized;
    }

    private String normalizeLink(String value) {
        if (value == null || value.isBlank()) return null;
        String link = value.trim();
        if (link.length() > 500 || !link.startsWith("/") || link.startsWith("//")
                || link.indexOf('\r') >= 0 || link.indexOf('\n') >= 0) {
            throw new IllegalArgumentException("Đường dẫn thông báo phải là đường dẫn nội bộ hợp lệ");
        }
        return link;
    }

    private void dispatchAfterCommit(List<NotificationEventResponse> events) {
        Runnable dispatch = () -> events.forEach(this::dispatch);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch.run();
                }
            });
        } else {
            dispatch.run();
        }
    }

    private void dispatch(NotificationEventResponse event) {
        Set<SseEmitter> emitters = subscribers.get(event.getRecipientId());
        if (emitters == null) return;
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .id(Long.toString(event.getId()))
                        .name("notification")
                        .data(event));
            } catch (IOException | IllegalStateException error) {
                removeSubscriber(event.getRecipientId(), emitter);
                log.debug("Removed disconnected notification stream for user {}", event.getRecipientId());
            }
        }
    }

    private boolean hasSubscribers(Integer userId) {
        Set<SseEmitter> emitters = subscribers.get(userId);
        return emitters != null && !emitters.isEmpty();
    }

    private void removeSubscriber(Integer userId, SseEmitter emitter) {
        subscribers.computeIfPresent(userId, (ignored, emitters) -> {
            emitters.remove(emitter);
            return emitters.isEmpty() ? null : emitters;
        });
    }
}
