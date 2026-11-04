package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Value;

import java.time.LocalDateTime;

@Value
@Builder
public class NotificationEventResponse {
    long id;
    Integer recipientId;
    Integer senderId;
    String title;
    String content;
    LocalDateTime createdAt;
    String link;
    String kind;
}
