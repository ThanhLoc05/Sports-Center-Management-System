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
        var slice=repository.findByRecipientIdOrderByCreatedAtDescIdDesc(currentRecipient(),PageRequest.of(page,size));
        return new NotificationHistoryPage(slice.getContent().stream().map(GeneralNotificationHistory::toItem).toList(),page,size,slice.hasNext());
    }
    @Transactional
    public NotificationHistoryItem read(long id) {
        if(id<1)throw new IllegalArgumentException("Invalid notification ID");
        Integer recipient=currentRecipient();
        // Ownership is part of both the lookup and the atomic update; never accept recipient from the client.
        repository.findByIdAndRecipientId(id,recipient).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        repository.markRead(id,recipient,LocalDateTime.now());
        return toItem(repository.findByIdAndRecipientId(id,recipient).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND)));
    }
    public static NotificationHistoryItem toItem(GeneralNotification n) {
        return new NotificationHistoryItem(n.getId(),n.getSenderId(),n.getRecipientId(),n.getTitle(),n.getContent(),n.getLink(),"GENERAL",n.getCreatedAt(),n.getReadAt());
    }
}
