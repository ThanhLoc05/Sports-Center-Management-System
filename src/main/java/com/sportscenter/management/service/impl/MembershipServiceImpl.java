package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Request.MembershipPackageRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipPackageResponse;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.MembershipService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class MembershipServiceImpl implements MembershipService {

    private final MemberSubscriptionRepository subscriptionRepository;
    private final MembershipPackageRepository packageRepository;
    private final UserRepository userRepository;
    @Override
    @Transactional(readOnly = true)
    public List<MembershipPackageResponse> getAllPackages() {
        return packageRepository.findAll().stream()
                .map(pkg -> MembershipPackageResponse.builder()
                        .id(pkg.getId())
                        .packageName(pkg.getPackageName())
                        .durationDays(pkg.getDurationDays())
                        .price(pkg.getPrice())
                        .description(pkg.getDescription())
                        .status(pkg.getStatus())
                        .build())
                .toList();
    }
    @Override
    public MembershipPackageResponse createPackage(MembershipPackageRequest request) {
        MembershipPackage pkg = MembershipPackage.builder()
                .packageName(request.getPackageName())
                .durationDays(request.getDurationDays())
                .price(request.getPrice())
                .description(request.getDescription())
                .status(request.getStatus() != null ? request.getStatus() : "ACTIVE")
                .build();
        MembershipPackage saved = packageRepository.save(pkg);
        return MembershipPackageResponse.builder()
                .id(saved.getId())
                .packageName(saved.getPackageName())
                .durationDays(saved.getDurationDays())
                .price(saved.getPrice())
                .description(saved.getDescription())
                .status(saved.getStatus())
                .build();
    }
    @Override
    public MemberSubscriptionResponse subscribeMembershipPackage(MemberSubscriptionRequest request) {
        if (request == null || request.getMemberId() == null || request.getPackageId() == null) {
            throw new IllegalArgumentException("Thành viên và gói tập là bắt buộc");
        }
        // Validate member exists
        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        // Validate package exists
        MembershipPackage pkg = packageRepository.findById(request.getPackageId())
                .orElseThrow(() -> new IllegalArgumentException("Gói thành viên không tồn tại"));

        if (!"ACTIVE".equals(pkg.getStatus()) || pkg.getDurationDays() == null || pkg.getDurationDays() <= 0) {
            throw new IllegalArgumentException("Gói thành viên không khả dụng");
        }

        // Check if member already has active subscription
        Optional<MemberSubscription> existingActive = subscriptionRepository
                .findActiveMembership(request.getMemberId());

        if (existingActive.isPresent()) {
            throw new IllegalArgumentException("Thành viên đã có gói tập đang hoạt động");
        }

        // Create new subscription
        LocalDate startDate = LocalDate.now();
        LocalDate endDate = startDate.plusDays(pkg.getDurationDays());

        MemberSubscription subscription = MemberSubscription.builder()
                .memberId(request.getMemberId())
                .packageId(request.getPackageId())
                .startDate(startDate)
                .endDate(endDate)
                .status("ACTIVE")
                .build();

        MemberSubscription savedSubscription = subscriptionRepository.save(subscription);
        return mapToResponse(savedSubscription);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<MemberSubscriptionResponse> getActiveMembership(Integer memberId) {
        return subscriptionRepository.findActiveMembership(memberId)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<MemberSubscriptionResponse> getMemberSubscriptionHistory(Integer memberId) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }
        List<MemberSubscription> subscriptions = subscriptionRepository.findByMemberId(memberId);

        return subscriptions.stream().map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public MemberSubscriptionResponse renewSubscription(Integer subscriptionId, Integer packageId) {
        MemberSubscription oldSubscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));

        MembershipPackage pkg = packageRepository.findById(packageId)
                .orElseThrow(() -> new IllegalArgumentException("Gói thành viên không tồn tại"));

        if (!"ACTIVE".equals(pkg.getStatus()) || pkg.getDurationDays() == null || pkg.getDurationDays() <= 0) {
            throw new IllegalArgumentException("Gói thành viên không khả dụng");
        }

        // Cancel old subscription
        oldSubscription.setStatus("EXPIRED");
        subscriptionRepository.save(oldSubscription);

        // Create new subscription
        LocalDate newStartDate = LocalDate.now();
        LocalDate newEndDate = newStartDate.plusDays(pkg.getDurationDays());

        MemberSubscription newSubscription = MemberSubscription.builder()
                .memberId(oldSubscription.getMemberId())
                .packageId(packageId)
                .startDate(newStartDate)
                .endDate(newEndDate)
                .status("ACTIVE")
                .build();

        MemberSubscription savedSubscription = subscriptionRepository.save(newSubscription);
        return mapToResponse(savedSubscription);
    }

    @Override
    public MemberSubscriptionResponse cancelSubscription(Integer subscriptionId) {
        MemberSubscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));

        if (!"ACTIVE".equals(subscription.getStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hủy gói tập đang hoạt động");
        }
        subscription.setStatus("CANCELLED");
        MemberSubscription updatedSubscription = subscriptionRepository.save(subscription);

        return mapToResponse(updatedSubscription);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasMembership(Integer memberId) {
        return subscriptionRepository.findActiveMembership(memberId).isPresent();
    }

    @Override
    @Transactional(readOnly = true)
    public String getSubscriptionExpirationDate(Integer memberId) {
        Optional<MemberSubscription> subscription = subscriptionRepository.findActiveMembership(memberId);
        return subscription.map(sub -> sub.getEndDate().toString())
                .orElse(null);
    }

    private MemberSubscriptionResponse mapToResponse(MemberSubscription subscription) {
        return MemberSubscriptionResponse.builder()
                .id(subscription.getId())
                .memberId(subscription.getMemberId())
                .packageId(subscription.getPackageId())
                .startDate(subscription.getStartDate())
                .endDate(subscription.getEndDate())
                .status(subscription.getStatus())
                .build();
    }
}
