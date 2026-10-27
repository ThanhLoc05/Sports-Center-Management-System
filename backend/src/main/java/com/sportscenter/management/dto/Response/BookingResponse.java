package com.sportscenter.management.dto.Response;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BookingResponse {

    private Integer id;

    private Integer classId;

    private Integer memberId;

    private LocalDateTime bookedAt;

    private String status;
}