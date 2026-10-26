package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberSubscriptionRequest;
import com.sportscenter.management.dto.Request.MembershipPackageRequest;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipPackageResponse;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.MembershipService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
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
    private final InvoiceRepository invoiceRepository;

    @Override
    @Transactional(readOnly = true)
    public List<MembershipPackageResponse> getAllPackages() {
        return packageRepository.findAll().stream()
                .map(pkg -> MembershipPackageResponse.builder()
                        .id(pkg.getId())
                        .packageName(pkg.getPackageName())
                        .durationDays(pkg.getDurationDays())
                        .price(pkg.getPrice())
                        .accessLevel(pkg.getAccessLevel())
                        .description(pkg.getDescription())
                        .status(pkg.getStatus())
                        .build())
                .collect(Collectors.toList());
    }

    @Override
    public MembershipPackageResponse createPackage(MembershipPackageRequest request) {
        if (request == null || request.getPackageName() == null || request.getPrice() == null) {
            throw new IllegalArgumentException("Tên gói tập và giá tiền là bắt buộc");
        }
        String accessLevel = normalizeAccessLevel(request.getAccessLevel());
        MembershipPackage pkg = MembershipPackage.builder()
                .packageName(request.getPackageName())
                .durationDays(request.getDurationDays() != null ? request.getDurationDays() : 30)
                .price(request.getPrice())
                .accessLevel(accessLevel)
                .description(request.getDescription())
                .status(request.getStatus() != null ? request.getStatus() : "ACTIVE")
                .build();
        MembershipPackage saved = packageRepository.save(pkg);
        return MembershipPackageResponse.builder()
                .id(saved.getId())
                .packageName(saved.getPackageName())
                .durationDays(saved.getDurationDays())
                .price(saved.getPrice())
                .accessLevel(saved.getAccessLevel())
                .description(saved.getDescription())
                .status(saved.getStatus())
                .build();
    }

    @Override
    public MemberSubscriptionResponse subscribeMembershipPackage(MemberSubscriptionRequest request) {
        if (request == null || request.getMemberId() == null || request.getPackageId() == null
                || request.getStartDate() == null) {
            throw new IllegalArgumentException("Thành viên, gói tập và ngày bắt đầu là bắt buộc");
        }
        // Kiểm tra tài khoản hội viên tồn tại.
        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        // Kiểm tra gói hội viên tồn tại và đang được mở bán.
        MembershipPackage pkg = packageRepository.findById(request.getPackageId())
                .orElseThrow(() -> new IllegalArgumentException("Gói thành viên không tồn tại"));

        if (!"ACTIVE".equals(pkg.getStatus()) || pkg.getDurationDays() == null || pkg.getDurationDays() <= 0) {
            throw new IllegalArgumentException("Gói thành viên không khả dụng");
        }

        // Không tạo gói mới nếu hội viên đang có một gói còn hiệu lực.
        Optional<MemberSubscription> existingActive = subscriptionRepository
                .findActiveMembership(request.getMemberId());

        if (existingActive.isPresent()) {
            throw new IllegalArgumentException("Thành viên đã có gói tập đang hoạt động. Vui lòng chọn gia hạn thay vì đăng ký mới.");
        }

        // Kiểm tra xem thành viên có gói tập nào đang chờ thanh toán hay không
        boolean hasPending = subscriptionRepository.findByMemberId(request.getMemberId()).stream()
                .anyMatch(sub -> "PENDING_PAYMENT".equals(sub.getStatus()));
        if (hasPending) {
            throw new IllegalArgumentException("Thành viên đang có gói tập chờ thanh toán. Vui lòng thanh toán hóa đơn hoặc hủy yêu cầu cũ.");
        }

        // Tạo gói tập mới với trạng thái PENDING_PAYMENT (chờ thanh toán)
        LocalDate startDate = request.getStartDate();
        LocalDate endDate = startDate.plusDays(pkg.getDurationDays());

        MemberSubscription subscription = MemberSubscription.builder()
                .memberId(request.getMemberId())
                .packageId(request.getPackageId())
                .startDate(startDate)
                .endDate(endDate)
                .status("PENDING_PAYMENT")
                .build();

        MemberSubscription savedSubscription = subscriptionRepository.save(subscription);

        // Tự động sinh Hóa đơn (Invoice) liên kết với gói tập vừa đăng ký
        Invoice invoice = Invoice.builder()
                .subscriptionId(savedSubscription.getId())
                .memberId(savedSubscription.getMemberId())
                .amount(pkg.getPrice())
                .currency("VND")
                .paymentMethod("CASH") // Mặc định CASH, có thể đổi khi thanh toán tại quầy
                .paymentStatus("PENDING")
                .createdAt(LocalDateTime.now())
                .build();
        invoiceRepository.save(invoice);

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
        return subscriptionRepository.findByMemberId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public MemberSubscriptionResponse getSubscriptionById(Integer subscriptionId) {
        MemberSubscription sub = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));
        return mapToResponse(sub);
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

        // Gia hạn nối tiếp sau ngày hết hạn cũ hoặc từ ngày hôm nay
        LocalDate newStartDate = oldSubscription.getEndDate().isAfter(LocalDate.now())
                ? oldSubscription.getEndDate().plusDays(1)
                : LocalDate.now();
        LocalDate newEndDate = newStartDate.plusDays(pkg.getDurationDays());

        MemberSubscription newSubscription = MemberSubscription.builder()
                .memberId(oldSubscription.getMemberId())
                .packageId(packageId)
                .startDate(newStartDate)
                .endDate(newEndDate)
                .status("PENDING_PAYMENT")
                .build();

        MemberSubscription savedSubscription = subscriptionRepository.save(newSubscription);

        // Tự động sinh Hóa đơn cho lần gia hạn này
        Invoice invoice = Invoice.builder()
                .subscriptionId(savedSubscription.getId())
                .memberId(savedSubscription.getMemberId())
                .amount(pkg.getPrice())
                .currency("VND")
                .paymentMethod("CASH")
                .paymentStatus("PENDING")
                .createdAt(LocalDateTime.now())
                .build();
        invoiceRepository.save(invoice);

        return mapToResponse(savedSubscription);
    }

    @Override
    public MemberSubscriptionResponse cancelSubscription(Integer subscriptionId) {
        MemberSubscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));

        if (!"ACTIVE".equals(subscription.getStatus()) && !"PENDING_PAYMENT".equals(subscription.getStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hủy gói tập đang hoạt động hoặc đang chờ thanh toán");
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

    private String normalizeAccessLevel(String accessLevel) {
        String normalized = accessLevel == null || accessLevel.isBlank()
                ? "STANDARD" : accessLevel.trim().toUpperCase();
        if (!"STANDARD".equals(normalized) && !"VIP".equals(normalized)) {
            throw new IllegalArgumentException("Cấp độ gói chỉ được là STANDARD hoặc VIP");
        }
        return normalized;
    }
}
