package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RoomRequest {

    @NotBlank(message = "Tên phòng là bắt buộc")
    private String roomName;

    @NotNull(message = "Sức chứa phòng là bắt buộc")
    @Positive(message = "Sức chứa phòng phải lớn hơn 0")
    private Integer capacity;
}