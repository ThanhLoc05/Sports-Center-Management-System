package com.sportscenter.management.dto.Response;
import java.time.LocalDateTime;
public record NotificationHistoryItem(long id,Integer senderId,Integer recipientId,String title,String content,
                                     String link,String kind,LocalDateTime createdAt,LocalDateTime readAt) {}
