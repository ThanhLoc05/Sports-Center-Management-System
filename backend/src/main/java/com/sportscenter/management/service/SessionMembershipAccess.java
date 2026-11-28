package com.sportscenter.management.service;

import com.sportscenter.management.entity.Classes;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class SessionMembershipAccess {
    private final MemberSubscriptionRepository subscriptionRepository;
    private final MembershipPackageRepository packageRepository;

    public void require(Classes clazz, int memberId, boolean requireSelectedSport) {
        require(clazz.getScheduleTime().toLocalDate(), clazz.getSportId(), clazz.getRequiredAccessLevel(),
                memberId, requireSelectedSport);
    }

    public void require(LocalDate classDate, Integer sportId, String requiredAccessLevel,
                        int memberId, boolean requireSelectedSport) {
        requireLevel(classDate, sportId, requiredAccessLevel, memberId, requireSelectedSport);
    }

    public String waitlistLevel(Classes clazz, int memberId, LocalDate today) {
        String sessionLevel = requireLevel(clazz.getScheduleTime().toLocalDate(), clazz.getSportId(),
                clazz.getRequiredAccessLevel(), memberId, true);
        if (!"VIP".equals(sessionLevel)) return "STANDARD";
        return activeSubscription(memberId, today).map(this::level).filter("VIP"::equals).orElse("STANDARD");
    }

    private String requireLevel(LocalDate classDate, Integer sportId, String requiredAccessLevel,
                                int memberId, boolean requireSelectedSport) {
        var subscription = subscription(memberId, classDate);
        String packageLevel = level(subscription);
        String requiredLevel = normalizeAccessLevel(requiredAccessLevel);
        if ("VIP".equals(requiredLevel) && !"VIP".equals(packageLevel)) {
            throw new IllegalArgumentException("Lớp này chỉ dành cho hội viên gói VIP");
        }
        if (requireSelectedSport && "STANDARD".equals(packageLevel) && !sportId.equals(subscription.getSelectedSportId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, subscription.getSelectedSportId() == null
                    ? "Chọn bộ môn cho kỳ STANDARD trước khi đăng ký buổi mới."
                    : "Buổi này không thuộc bộ môn của kỳ STANDARD.");
        }
        return packageLevel;
    }

    private MemberSubscription subscription(int memberId, LocalDate date) {
        return activeSubscription(memberId, date).orElseThrow(() -> new IllegalArgumentException(
                        "Học viên chưa có gói tập hợp lệ hoặc gói tập đã hết hạn. Vui lòng thanh toán gói tập trước khi đặt lịch."));
    }

    private Optional<MemberSubscription> activeSubscription(int memberId, LocalDate date) {
        return subscriptionRepository
                .findFirstByMemberIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateDescIdDesc(
                        memberId, "ACTIVE", date, date);
    }

    private String level(MemberSubscription subscription) {
        var memberPackage = packageRepository.findById(subscription.getPackageId())
                .orElseThrow(() -> new IllegalStateException("Gói của hội viên không tồn tại"));
        return normalizeAccessLevel(subscription.getEntitlementLevel() == null
                ? memberPackage.getAccessLevel() : subscription.getEntitlementLevel());
    }

    private String normalizeAccessLevel(String accessLevel) {
        if (accessLevel == null || accessLevel.isBlank()) return "STANDARD";
        String normalized = accessLevel.trim().toUpperCase();
        if (!"STANDARD".equals(normalized) && !"VIP".equals(normalized)) {
            throw new IllegalStateException("Cấp độ quyền truy cập không hợp lệ trong database");
        }
        return normalized;
    }
}
