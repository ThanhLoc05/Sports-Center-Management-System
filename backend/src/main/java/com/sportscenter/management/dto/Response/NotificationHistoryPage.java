package com.sportscenter.management.dto.Response;
import java.util.List;
public record NotificationHistoryPage(List<NotificationHistoryItem> content,int page,int size,boolean hasNext) {}
