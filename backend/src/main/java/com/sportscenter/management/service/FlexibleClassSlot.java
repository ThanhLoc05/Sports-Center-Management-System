package com.sportscenter.management.service;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Arrays;

public enum FlexibleClassSlot {
    SLOT_01(6, 0),
    SLOT_02(8, 0),
    SLOT_03(15, 0),
    SLOT_04(16, 30),
    SLOT_05(18, 0),
    SLOT_06(19, 30);

    public static final int DURATION_MINUTES = 90;
    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final LocalTime start;

    FlexibleClassSlot(int hour, int minute) {
        start = LocalTime.of(hour, minute);
    }

    public LocalTime start() {
        return start;
    }

    public LocalTime end() {
        return start.plusMinutes(DURATION_MINUTES);
    }

    public static void requireScheduledSlot(LocalDateTime start, Integer duration) {
        if (start == null || duration == null || duration != DURATION_MINUTES
                || Arrays.stream(values()).noneMatch(slot -> slot.start.equals(start.toLocalTime()))) {
            throw new IllegalArgumentException("Buổi tập theo gói phải dùng một trong 6 ca cố định, mỗi ca 90 phút.");
        }
    }
}
