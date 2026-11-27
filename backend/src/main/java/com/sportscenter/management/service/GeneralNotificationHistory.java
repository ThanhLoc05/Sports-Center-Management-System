package com.sportscenter.management.service;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.entity.GeneralNotification;
import com.sportscenter.management.repository.GeneralNotificationRepository;
import com.sportscenter.management.dto.Response.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service @RequiredArgsConstructor
public class GeneralNotificationHistory {
    private final GeneralNotificationRepository repository;
    private final SecurityUtils security;
    private Integer currentRecipient() {
        Integer id=security.getCurrentUserId();
        if(id==null || id<1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return id;
    }
    @Transactional(readOnly=true)
    public NotificationHistoryPage list(int page,int size) {
        if(page<0||page>100000||size<1||size>100) throw new IllegalArgumentException("Invalid notification pagination");
        Integer recipient = currentRecipient();
        var slice = repository.findByRecipientIdOrderByCreatedAtDescIdDesc(recipient, PageRequest.of(page, size));
        var keys = eventKeys(recipient, slice.getContent().stream().map(GeneralNotification::getId).toList());
        return new NotificationHistoryPage(slice.getContent().stream().map(item -> toItem(item, keys.get(item.getId()))).toList(),
                page, size, slice.hasNext(), repository.countByRecipientIdAndReadAtIsNull(recipient));
    }
    @Transactional
    public NotificationHistoryItem read(long id) {
        if(id<1)throw new IllegalArgumentException("Invalid notification ID");
        Integer recipient=currentRecipient();
        // Ownership is part of both the lookup and the atomic update; never accept recipient from the client.
        repository.findByIdAndRecipientId(id,recipient).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        repository.markRead(id,recipient,LocalDateTime.now());
        var row = repository.findByIdAndRecipientId(id,recipient).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        return toItem(row, eventKeys(recipient, List.of(id)).get(id));
    }

    private Map<Long, String> eventKeys(Integer recipient, List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<Long, String> keys = new HashMap<>();
        for (Object[] row : repository.findEventKeys(recipient, ids)) keys.put((Long) row[0], (String) row[1]);
        return keys;
    }

    private static NotificationHistoryItem toItem(GeneralNotification n, String eventKey) {
        return new NotificationHistoryItem(n.getId(),n.getSenderId(),n.getRecipientId(),n.getTitle(),n.getContent(),n.getLink(),"GENERAL",n.getCreatedAt(),n.getReadAt(),category(eventKey));
    }

    static String category(String eventKey) {
        if (eventKey == null) return null;
        if (eventKey.startsWith("CLASS_CHANGED:")) return "SCHEDULE";
        if (eventKey.startsWith("BOOKING_CONFIRMED:")) return "BOOKING";
        if (eventKey.startsWith("CLASS_CANCELLED:") || eventKey.startsWith("BOOKING_CANCELLED:")) return "CANCELLATION";
        if (eventKey.startsWith("WAITLIST_")) return "WAITLIST";
        if (eventKey.startsWith("WARNING:") || eventKey.startsWith("RESTRICTION:")) return "WARNING";
        return null;
    }
}
