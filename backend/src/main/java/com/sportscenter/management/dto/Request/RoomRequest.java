package com.sportscenter.management.dto.Request;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomRequest {

    private String roomName;

    private Integer capacity;
}