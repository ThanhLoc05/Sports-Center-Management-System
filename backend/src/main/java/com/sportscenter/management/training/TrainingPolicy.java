package com.sportscenter.management.training;

import java.time.*;
import java.util.*;
import static com.sportscenter.management.training.TrainingModels.*;

/** Pure scheduling rules shared by previews, registration and server validation. */
public final class TrainingPolicy {
    private TrainingPolicy() {}

    public static void validateSlots(List<SlotInput> slots) {
        if (slots == null || slots.isEmpty() || slots.size() > 7)
            throw new IllegalArgumentException("Chọn từ 1 đến 7 ngày học mỗi tuần");
        var days = new HashSet<Integer>();
        for (var slot : slots) {
            if (slot == null || slot.dayOfWeek() == null || slot.dayOfWeek() < 1 || slot.dayOfWeek() > 7
                    || !days.add(slot.dayOfWeek()) || slot.startTime() == null || slot.endTime() == null
                    || !slot.endTime().isAfter(slot.startTime()) || slot.startTime().getSecond()!=0 || slot.endTime().getSecond()!=0
                    || slot.startTime().getNano()!=0 || slot.endTime().getNano()!=0 || slot.coachId() == null || slot.roomId() == null)
                throw new IllegalArgumentException("Mỗi thứ chỉ có một khung giờ, giờ kết thúc phải sau giờ bắt đầu");
        }
    }

    public static List<Occurrence> occurrences(List<SlotInput> slots, LocalDate from, LocalDate until) {
        validateSlots(slots);
        if (from == null || until == null || until.isBefore(from)) return List.of();
        var result = new ArrayList<Occurrence>();
        for (LocalDate day=from; !day.isAfter(until); day=day.plusDays(1)) {
            for (var slot : slots) if (slot.dayOfWeek() == day.getDayOfWeek().getValue())
                result.add(new Occurrence(day.atTime(slot.startTime()),day.atTime(slot.endTime()),slot));
        }
        result.sort(Comparator.comparing(Occurrence::start));
        return result;
    }

    public static List<Occurrence> courseOccurrences(List<SlotInput> slots, LocalDate first, Integer count) {
        validateSlots(slots);
        if (first == null || count == null || count < 1 || count > 520)
            throw new IllegalArgumentException("Khóa học cần ngày khai giảng và từ 1 đến 520 buổi");
        if (slots.stream().noneMatch(slot -> slot.dayOfWeek() == first.getDayOfWeek().getValue()))
            throw new IllegalArgumentException("Ngày khai giảng phải trùng một trong các thứ học đã chọn");
        var result = occurrences(slots,first,first.plusWeeks(count + 1L));
        return List.copyOf(result.subList(0,count));
    }

    public static boolean overlaps(LocalDateTime start, LocalDateTime end, LocalDateTime otherStart, LocalDateTime otherEnd) {
        return start.isBefore(otherEnd) && otherStart.isBefore(end);
    }

    public static boolean matches(List<Slot> slots, List<Availability> availability) {
        if (availability == null || availability.isEmpty()) return true;
        for (var window : availability) {
            if (window == null || (window.dayOfWeek()==null && window.date()==null)
                    || (window.dayOfWeek()!=null && (window.dayOfWeek()<1 || window.dayOfWeek()>7))
                    || (window.fromTime()!=null && window.toTime()!=null && !window.toTime().isAfter(window.fromTime())))
                throw new IllegalArgumentException("Ngày và khoảng giờ rảnh không hợp lệ");
        }
        return slots.stream().allMatch(slot -> availability.stream().anyMatch(window -> {
            int day = window.date()==null ? window.dayOfWeek() : window.date().getDayOfWeek().getValue();
            return slot.dayOfWeek()==day && (window.fromTime()==null || !slot.startTime().isBefore(window.fromTime()))
                    && (window.toTime()==null || !slot.endTime().isAfter(window.toTime()));
        }));
    }

    public static boolean levelAllowed(String granted, String required) {
        return ("STANDARD".equals(granted) || "VIP".equals(granted))
                && ("STANDARD".equals(required) || ("VIP".equals(required) && "VIP".equals(granted)));
    }
}
