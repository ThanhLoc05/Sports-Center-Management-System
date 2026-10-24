package com.sportscenter.management.dto.Response;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomResponse {

    private Integer id;

    private String roomName;

    private Integer capacity;
}