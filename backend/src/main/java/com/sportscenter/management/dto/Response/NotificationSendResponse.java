package com.sportscenter.management.dto.Response;

import lombok.Builder;
import lombok.Value;

import java.util.List;

@Value
@Builder
public class NotificationSendResponse {
    int acceptedRecipients;
    int onlineRecipientsAtSend;
    List<Integer> workoutPlanIds;
}
