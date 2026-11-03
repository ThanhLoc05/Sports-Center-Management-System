package com.sportscenter.management.dto.Request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BookingRequest {

    private Integer classId;

    private Integer memberId;
}