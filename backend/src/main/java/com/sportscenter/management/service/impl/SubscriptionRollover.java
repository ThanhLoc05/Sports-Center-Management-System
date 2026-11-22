package com.sportscenter.management.service.impl;

import com.sportscenter.management.entity.MemberSubscription;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

final class SubscriptionRollover {
    private SubscriptionRollover() {}

    // Tính số ngày còn quyền tập, kể cả hôm nay. Các kỳ cũ có thể hở hoặc chồng ngày.
    static long remainingDays(List<MemberSubscription> periods, LocalDate from) {
        LocalDate cursor = from;
        long days = 0;
        for (var period : periods.stream().sorted(Comparator.comparing(MemberSubscription::getStartDate)).toList()) {
            LocalDate start = period.getStartDate().isAfter(cursor) ? period.getStartDate() : cursor;
            if (period.getEndDate().isBefore(start)) continue;
            cursor = period.getEndDate().plusDays(1);
            days += ChronoUnit.DAYS.between(start, cursor);
        }
        return days;
    }

    private static List<MemberSubscription> sources(List<MemberSubscription> periods, Integer id) {
        return periods.stream().filter(s -> Objects.equals(id, s.getRolledIntoId())).toList();
    }

    // Khôi phục phần đã mua trước, hoặc chuyển tiếp vào kỳ sau nếu hoàn một đơn ở giữa chuỗi gia hạn.
    // [FLOW 3] KHI HOÀN TIỀN: hủy gói bị hoàn, trả lại trạng thái cho gói cũ và tính lại hạn các kỳ gia hạn sau.
    static void cancel(MemberSubscription target, List<MemberSubscription> periods, LocalDate today) {
        Integer next = target.getRolledIntoId();
        for (var source : sources(periods, target.getId())) {
            source.setRolledIntoId(next);
            if (next == null && !"CANCELLED".equals(source.getStatus()) && !source.getEndDate().isBefore(today))
                source.setStatus("ACTIVE");
        }
        target.setRolledIntoId(null);
        target.setStatus("CANCELLED");
        while (next != null) {
            Integer id = next;
            var renewal = periods.stream().filter(s -> id.equals(s.getId())).findFirst().orElseThrow();
            long carried = remainingDays(sources(periods, id), renewal.getStartDate());
            renewal.setEndDate(renewal.getStartDate().plusDays(renewal.getPurchasedDays() - 1L + carried));
            next = renewal.getRolledIntoId();
        }
    }
}
