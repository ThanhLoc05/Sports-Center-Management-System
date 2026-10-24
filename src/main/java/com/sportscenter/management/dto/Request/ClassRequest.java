package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClassRequest {

    @NotBlank(message = "Tên lớp học là bắt buộc")
    private String className;

    @NotNull(message = "Bộ môn là bắt buộc")
    @Positive(message = "ID bộ môn phải lớn hơn 0")
    private Integer sportId;

    @NotNull(message = "Huấn luyện viên là bắt buộc")
    @Positive(message = "ID huấn luyện viên phải lớn hơn 0")
    private Integer coachId;

    @NotNull(message = "Phòng tập là bắt buộc")
    @Positive(message = "ID phòng tập phải lớn hơn 0")
    private Integer roomId;

    @NotNull(message = "Sức chứa lớp học là bắt buộc")
    @Positive(message = "Sức chứa lớp học phải lớn hơn 0")
    private Integer maxCapacity;

    @NotNull(message = "Thời gian học là bắt buộc")
    @Future(message = "Thời gian lớp học phải ở tương lai")
    private LocalDateTime scheduleTime;

    @Positive(message = "Thời lượng lớp học phải lớn hơn 0")
    private Integer durationMinutes;
}