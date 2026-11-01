package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeedbackResponse {

    private Integer id;
    private Integer fromUserId;
    private Integer toUserId;
    private Integer classId;
    private Integer rating;
    private String comment;
    private String type;
    private LocalDateTime createdAt;
}
