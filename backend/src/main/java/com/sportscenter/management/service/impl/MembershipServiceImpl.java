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
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.MembershipService;
import lombok.RequiredArgsConstructor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
    private final MembershipOrderRepository orderRepository;

    @Override
    @Transactional
    public MemberSubscriptionResponse chooseSport(Integer memberId, Integer subscriptionId, Integer sportId) {
        userRepository.findByIdForUpdate(memberId).orElseThrow();
        MemberSubscription subscription = subscriptionRepository.findByIdForUpdate(subscriptionId)
                .filter(row -> memberId.equals(row.getMemberId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy kỳ gói."));
        var today = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        String level = subscription.getEntitlementLevel();
        if (level == null) {
            level = packageRepository.findById(subscription.getPackageId()).orElseThrow().getAccessLevel();
        }
        if (!"ACTIVE".equals(subscription.getStatus()) || subscription.getStartDate().isAfter(today)
                || subscription.getEndDate().isBefore(today) || "VIP".equals(level)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chỉ được chọn môn cho kỳ STANDARD đang hiệu lực.");
        }
        if (subscription.getSelectedSportId() != null) {
            if (subscription.getSelectedSportId().equals(sportId)) return mapToResponse(subscription);
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Môn đã chọn được giữ đến hết kỳ.");
        }
        if (sportId == null || entityManager.find(com.sportscenter.management.entity.Sport.class, sportId) == null) {
            throw new IllegalArgumentException("Vui lòng chọn bộ môn hợp lệ.");
        }
        subscription.setSelectedSportId(sportId);
        subscription.setEntitlementLevel("STANDARD");
        return mapToResponse(subscriptionRepository.save(subscription));
    }

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional(readOnly = true)
    public List<MembershipPackageResponse> getAllPackages() {
        return packageRepository.findAll().stream()
                .map(this::mapPackage)
                .collect(Collectors.toList());
    }

    @Override
    public MembershipPackageResponse createPackage(MembershipPackageRequest request) {
        if (request == null || request.getPackageName() == null || request.getPrice() == null) {
            throw new IllegalArgumentException("Tên gói tập và giá tiền là bắt buộc");
        }
        String accessLevel = normalizeAccessLevel(request.getAccessLevel());
        validateBenefits(request);
        MembershipPackage pkg = MembershipPackage.builder()
                .packageName(request.getPackageName())
                .durationDays(request.getDurationDays() != null ? request.getDurationDays() : 30)
                .price(request.getPrice())
                .accessLevel(accessLevel)
                .description(request.getDescription())
                .status(request.getStatus() != null ? request.getStatus() : "ACTIVE")
                .build();
        applyDefaultBenefits(pkg);
        applyBenefits(pkg, request);
        if (pkg.getDescription() == null || pkg.getDescription().isBlank()) {
            pkg.setDescription(defaultDescription(accessLevel));
        }
        MembershipPackage saved = packageRepository.save(pkg);
        return mapPackage(saved);
    }

    @Override
    public MembershipPackageResponse updatePackage(Integer packageId, MembershipPackageRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin gói tập không được để trống");
        }
        validateBenefits(request);
        MembershipPackage pkg = packageRepository.findById(packageId)
                .orElseThrow(() -> new IllegalArgumentException("Gói thành viên không tồn tại"));

        if (request.getPackageName() != null && !request.getPackageName().isBlank()) {
            pkg.setPackageName(request.getPackageName().trim());
        }
        if (request.getDurationDays() != null && request.getDurationDays() > 0) {
            pkg.setDurationDays(request.getDurationDays());
        }
        if (request.getPrice() != null && request.getPrice().signum() > 0) {
            pkg.setPrice(request.getPrice());
        }
        if (request.getAccessLevel() != null) {
            String level = normalizeAccessLevel(request.getAccessLevel());
            if (!level.equals(pkg.getAccessLevel())) {
                pkg.setAccessLevel(level);
                applyDefaultBenefits(pkg);
            }
        }
        applyBenefits(pkg, request);
        if (request.getDescription() != null) {
            pkg.setDescription(request.getDescription());
        }
        if (request.getStatus() != null && !request.getStatus().isBlank()) {
            pkg.setStatus(request.getStatus().trim().toUpperCase());
        }

        MembershipPackage updated = packageRepository.save(pkg);
        return mapPackage(updated);
    }

    private MembershipPackageResponse mapPackage(MembershipPackage pkg) {
        return MembershipPackageResponse.builder()
                .id(pkg.getId()).packageName(pkg.getPackageName())
                .durationDays(pkg.getDurationDays()).price(pkg.getPrice())
                .accessLevel(pkg.getAccessLevel()).sportLimit(pkg.getSportLimit())
                .maxConcurrentClasses(pkg.getMaxConcurrentClasses())
                .courseDiscountPercent(pkg.getCourseDiscountPercent())
                .description(pkg.getDescription()).status(pkg.getStatus()).build();
    }

    private void applyDefaultBenefits(MembershipPackage pkg) {
        boolean vip = "VIP".equals(pkg.getAccessLevel());
        pkg.setSportLimit(vip ? null : 1);
        pkg.setMaxConcurrentClasses(vip ? 2 : 1);
        pkg.setCourseDiscountPercent(vip ? 10 : 0);
    }

    private void applyBenefits(MembershipPackage pkg, MembershipPackageRequest request) {
        boolean vip = "VIP".equals(pkg.getAccessLevel());
        Integer requested = request.getSportLimit();
        if ((request.getAllSports() != null && request.getAllSports() != vip)
                || (requested != null && (vip || requested != 1))) {
            throw new IllegalArgumentException("STANDARD chọn một môn; VIP tập tất cả môn.");
        }
        pkg.setSportLimit(vip ? null : 1);
        if (request.getMaxConcurrentClasses() != null) {
            pkg.setMaxConcurrentClasses(request.getMaxConcurrentClasses());
        }
        if (request.getCourseDiscountPercent() != null) {
            pkg.setCourseDiscountPercent(request.getCourseDiscountPercent());
        }
    }

    private void validateBenefits(MembershipPackageRequest request) {
        if ((request.getSportLimit() != null && request.getSportLimit() < 1)
                || (request.getMaxConcurrentClasses() != null && request.getMaxConcurrentClasses() < 1)
                || (request.getCourseDiscountPercent() != null
                    && (request.getCourseDiscountPercent() < 0 || request.getCourseDiscountPercent() > 100))) {
            throw new IllegalArgumentException("Số bộ môn, số lớp và ưu đãi khóa học không hợp lệ");
        }
    }

    private String defaultDescription(String accessLevel) {
        return "VIP".equals(accessLevel)
                ? "Tham gia lớp STANDARD và VIP, xem lịch, thông tin HLV và theo dõi kết quả tập luyện. Khăn tập và nước uống miễn phí khi tập tại trung tâm."
                : "Duy trì tập luyện với các lớp STANDARD; xem lịch, thông tin HLV và theo dõi kết quả tập luyện.";
    }

    @Override
    public void deletePackage(Integer packageId) {
        MembershipPackage pkg = packageRepository.findById(packageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Gói tập không tồn tại"));
        if (subscriptionRepository.existsByPackageId(packageId)
                || orderRepository.existsByPackageIdOrSourcePackageId(packageId, packageId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Gói đã có đơn hàng hoặc kỳ đăng ký liên quan, hãy ngừng bán thay vì xóa");
        }
        packageRepository.delete(pkg);
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
        LocalDate endDate = startDate.plusDays(pkg.getDurationDays() - 1L);

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
        LocalDate newStartDate = oldSubscription.getEndDate() != null && oldSubscription.getEndDate().isAfter(LocalDate.now())
                ? oldSubscription.getEndDate().plusDays(1)
                : LocalDate.now();
        LocalDate newEndDate = newStartDate.plusDays(pkg.getDurationDays() - 1L);

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
        Integer memberId = subscriptionRepository.findMemberIdById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));
        // Cùng khóa thành viên với confirm; không lấy khóa đơn trong luồng hủy.
        userRepository.findByIdForUpdate(memberId)
                .orElseThrow(() -> new IllegalArgumentException("Thành viên không tồn tại"));
        MemberSubscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));
        // Controller có thể đã đọc entity trước đó; refresh sau khóa để không kiểm tra trạng thái cache cũ.
        entityManager.refresh(subscription, LockModeType.PESSIMISTIC_WRITE);

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
                .selectedSportId(subscription.getSelectedSportId())
                .entitlementLevel(subscription.getEntitlementLevel())
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
