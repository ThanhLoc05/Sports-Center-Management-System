package com.sportscenter.management.dto.Request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ClassCancellationRequest(
        @NotNull(message = "Vui lòng chọn lý do hủy buổi học.") Reason reason,
        @Size(max = 500, message = "Mô tả lý do tối đa 500 ký tự.") String description,
        @Size(max = 500, message = "Ghi chú tối đa 500 ký tự.") String note) {

    public enum Reason {
        COACH_UNAVAILABLE("Huấn luyện viên không thể tham gia"),
        ROOM_UNAVAILABLE("Sân/phòng không thể sử dụng"),
        SCHEDULE_CHANGE("Thay đổi lịch hoạt động"),
        CREATED_BY_MISTAKE("Tạo nhầm buổi học"),
        OTHER("Lý do khác");

        private final String label;

        Reason(String label) {
            this.label = label;
        }
    }

    public String publicReason() {
        if (reason == null) {
            throw new IllegalArgumentException("Vui lòng chọn lý do hủy buổi học.");
        }
        if (reason != Reason.OTHER) return reason.label;
        if (description == null || description.isBlank()) {
            throw new IllegalArgumentException("Vui lòng mô tả lý do hủy buổi học.");
        }
        return description.strip();
    }
}
