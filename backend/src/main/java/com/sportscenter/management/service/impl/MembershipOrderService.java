package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.payment.*;
import com.sportscenter.management.dto.Request.ConfirmMembershipOrderRequest;
import com.sportscenter.management.dto.Request.MembershipOrderRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.dto.Response.MemberSubscriptionResponse;
import com.sportscenter.management.dto.Response.MembershipOfferResponse;
import com.sportscenter.management.dto.Response.MembershipOrderResponse;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.entity.MembershipPackage;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Đăng ký/gia hạn chỉ có hiệu lực sau khi thu tiền được xác nhận trong cùng transaction. */
@Service
@RequiredArgsConstructor
@Transactional
public class MembershipOrderService {
    private final MembershipOrderRepository orderRepository;
    private final MembershipPackageRepository packageRepository;
    private final MemberSubscriptionRepository subscriptionRepository;
    private final InvoiceRepository invoiceRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;
    // BỔ SUNG: lấy cấu hình ngân hàng, giao dịch đã đối soát và thông báo cho cùng luồng đơn gói.
    private final BankAccountService bankAccounts;
    private final BankPaymentEventRepository bankEvents;
    private final MembershipNotificationService notifications;
    private final PaymentIntegrationProperties paymentProperties;

    @PersistenceContext
    private EntityManager entityManager;

    @Transactional(readOnly = true)
    public List<MembershipOfferResponse> getPackages() {
        return packageRepository.findByStatus("ACTIVE").stream()
                .filter(pkg -> pkg.getPrice() != null && pkg.getPrice().signum() > 0
                        && pkg.getPrice().stripTrailingZeros().scale() <= 0
                        && pkg.getPrice().compareTo(new java.math.BigDecimal("9007199254740991")) <= 0
                        && pkg.getDurationDays() != null && pkg.getDurationDays() > 0)
                .map(this::toOffer)
                .toList();
    }

    public MembershipOrderResponse create(MembershipOrderRequest request, String idempotencyKey) {
        validateIdempotencyKey(idempotencyKey);
        Integer actorId = currentActorId();
        String fingerprint = hash(request.getMemberId() + "|" + request.getPackageId() + "|"
                + request.getSourceSubscriptionId() + "|" + request.getPaymentMethod());

        Optional<MembershipOrder> retry = orderRepository.findByCreatedByAndIdempotencyKey(actorId, idempotencyKey);
        if (retry.isPresent()) {
            if (!retry.get().getRequestFingerprint().equals(fingerprint)) {
                throw conflict("Idempotency-Key này đã được dùng với nội dung khác.");
            }
            return toResponse(retry.get());
        }

        var member = userRepository.findById(request.getMemberId())
                .orElseThrow(() -> new IllegalArgumentException("Thành viên không tồn tại"));
        if (member.getRole() == null || !"MEMBER".equals(member.getRole().getRoleName())) {
            throw new IllegalArgumentException("Tài khoản được chọn không có vai trò thành viên");
        }
        MembershipPackage pkg = packageRepository.findById(request.getPackageId())
                .orElseThrow(() -> new IllegalArgumentException("Gói thành viên không tồn tại"));
        if (!"ACTIVE".equals(pkg.getStatus()) || pkg.getPrice() == null || pkg.getPrice().signum() <= 0
                || pkg.getDurationDays() == null || pkg.getDurationDays() <= 0) {
            throw new IllegalArgumentException("Gói thành viên không khả dụng hoặc chưa có giá hợp lệ");
        }
        if (pkg.getPrice().stripTrailingZeros().scale() > 0
                || pkg.getPrice().compareTo(new java.math.BigDecimal("9007199254740991")) > 0) {
            throw new IllegalArgumentException("Giá gói phải là số nguyên VND trong giới hạn hỗ trợ");
        }
        if (!"CASH".equals(request.getPaymentMethod()) && !"BANK_TRANSFER".equals(request.getPaymentMethod())) {
            throw new IllegalArgumentException("Chỉ hỗ trợ tiền mặt hoặc chuyển khoản ngân hàng");
        }

        Integer sourceId = request.getSourceSubscriptionId();
        MemberSubscription source = null;
        String kind = "NEW";
        Integer sourcePackageId = null;
        if (sourceId != null) {
            source = subscriptionRepository.findById(sourceId)
                    .orElseThrow(() -> new IllegalArgumentException("Gói cũ cần gia hạn không tồn tại"));
            if (!Objects.equals(source.getMemberId(), request.getMemberId())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Gói cũ không thuộc thành viên này.");
            }
            if (!"ACTIVE".equals(source.getStatus()) && !"EXPIRED".equals(source.getStatus())) {
                throw conflict("Chỉ có thể gia hạn gói đang dùng hoặc đã hết hạn.");
            }
            Optional<MemberSubscription> current = subscriptionRepository.findActiveMembership(request.getMemberId());
            if (current.isPresent() && !current.get().getId().equals(sourceId)) {
                throw conflict("Thành viên đang có một gói khác còn hiệu lực; hãy chọn đúng gói đang dùng.");
            }
            kind = "RENEWAL";
            sourcePackageId = source.getPackageId();
        } else if (subscriptionRepository.findActiveMembership(request.getMemberId()).isPresent()) {
            throw conflict("Thành viên đã có gói đang hoạt động. Hãy tạo yêu cầu gia hạn gói đó.");
        }

        if (orderRepository.existsByMemberIdAndStatus(request.getMemberId(), "PENDING_PAYMENT")) {
            throw conflict("Thành viên đã có yêu cầu chờ thanh toán. Hãy mở yêu cầu hiện tại hoặc nhờ lễ tân xử lý.");
        }

        LocalDateTime now = LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        MembershipOrder order = MembershipOrder.builder()
                .memberId(request.getMemberId())
                .packageId(pkg.getId())
                .kind(kind)
                .sourceSubscriptionId(sourceId)
                .sourcePackageId(sourcePackageId)
                .packageName(pkg.getPackageName())
                .packagePrice(pkg.getPrice())
                .packageDurationDays(pkg.getDurationDays())
                .packageStatus(pkg.getStatus())
                .paymentMethod(request.getPaymentMethod())
                .status("PENDING_PAYMENT")
                .idempotencyKey(idempotencyKey)
                .requestFingerprint(fingerprint)
                .createdBy(actorId)
                .version(0)
                .createdAt(now)
                .build();
        // BỔ SUNG: chỉ QR được áp dụng khoản thu demo khi bật rõ; tiền mặt luôn dùng giá gói đầy đủ.
        boolean demo = "BANK_TRANSFER".equals(order.getPaymentMethod()) && paymentProperties.demoFor(pkg.getId());
        order.setDemoPayment(demo);
        order.setPayableAmountSnapshot(demo ? paymentProperties.qrAmount(pkg.getId(), pkg.getPrice()) : pkg.getPrice());
        // BỔ SUNG: chụp ngân hàng lúc tạo đơn để quản lý đổi cấu hình sau đó không làm đổi QR cũ.
        if ("BANK_TRANSFER".equals(order.getPaymentMethod())) {
            BankAccountData bank = bankAccounts.requireAccount();
            order.setBankBinSnapshot(bank.bankBin()); order.setBankNameSnapshot(bank.bankName());
            order.setBankAccountNoSnapshot(bank.accountNo()); order.setBankAccountNameSnapshot(bank.accountName());
            order.setBankGatewaySnapshot(bank.gatewayName());
        }
        order = orderRepository.saveAndFlush(order);

        Invoice invoice = Invoice.builder()
                .membershipOrderId(order.getId())
                .memberId(order.getMemberId())
                .amount(payable(order))
                .currency("VND")
                .paymentMethod(order.getPaymentMethod())
                .paymentStatus("PENDING")
                .createdAt(now)
                .build();
        invoiceRepository.saveAndFlush(invoice);
        return toResponse(order);
    }

    @Transactional(readOnly = true)
    public List<MembershipOrderResponse> list(Integer requestedMemberId) {
        Integer actorId = currentActorId();
        if (securityUtils.hasRole("MEMBER")) {
            if (requestedMemberId != null && !requestedMemberId.equals(actorId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chỉ được xem yêu cầu của chính mình.");
            }
            requestedMemberId = actorId;
        } else if (!isStaff()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xem yêu cầu thanh toán gói.");
        }
        List<MembershipOrder> orders = requestedMemberId == null
                ? orderRepository.findAllByOrderByCreatedAtDesc()
                : orderRepository.findByMemberIdOrderByCreatedAtDesc(requestedMemberId);
        return orders.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public MembershipOrderResponse detail(Integer orderId) {
        MembershipOrder order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy yêu cầu thanh toán gói."));
        ensureCanRead(order);
        return toResponse(order);
    }

    /** Nhân viên chỉ thu tiền mặt; QR phải do giao dịch ngân hàng đã xác thực kích hoạt. */
    public MembershipOrderResponse confirm(Integer orderId, ConfirmMembershipOrderRequest request, String idempotencyKey) {
        return confirmInternal(orderId, request, idempotencyKey, false);
    }

    /** Chỉ webhook service gọi sau khi lưu giao dịch đã xác thực; không có REST endpoint công khai cho hàm này. */
    public MembershipOrderResponse confirmBankTransfer(Integer orderId, String transactionId) {
        MembershipOrder order = orderRepository.findByIdForUpdate(orderId).orElseThrow();
        Invoice invoice = invoiceRepository.findByMembershipOrderId(orderId).orElseThrow();
        if (!"BANK_TRANSFER".equals(order.getPaymentMethod()) || order.getBankAccountNoSnapshot() == null
                || !"VND".equals(invoice.getCurrency()) || invoice.getAmount().compareTo(payable(order)) != 0
                || bankEvents.receivedTotal(invoice.getId()).compareTo(invoice.getAmount()) != 0)
            throw conflict("Chưa có số tiền chuyển khoản hợp lệ khớp hóa đơn.");
        ConfirmMembershipOrderRequest request = new ConfirmMembershipOrderRequest();
        request.setVersion(order.getVersion()); request.setBankTransactionId(transactionId);
        return confirmInternal(orderId, request, "sepay:" + transactionId, true);
    }

    private MembershipOrderResponse confirmInternal(Integer orderId, ConfirmMembershipOrderRequest request, String idempotencyKey, boolean gateway) {
        validateIdempotencyKey(idempotencyKey);
        MembershipOrder order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy yêu cầu thanh toán gói."));
        if (gateway ? !"BANK_TRANSFER".equals(order.getPaymentMethod()) : !"CASH".equals(order.getPaymentMethod()))
            throw conflict("Đơn QR chỉ được xác nhận qua kết nối giao dịch ngân hàng, không xác nhận tiền mặt thủ công.");
        String bankTransactionId = request.getBankTransactionId() == null
                ? null : request.getBankTransactionId().trim();
        if ("BANK_TRANSFER".equals(order.getPaymentMethod()) && (bankTransactionId == null || bankTransactionId.isBlank())) {
            throw new IllegalArgumentException("Nhập mã giao dịch thực nhận trên sao kê ngân hàng");
        }
        if ("CASH".equals(order.getPaymentMethod()) && bankTransactionId != null && !bankTransactionId.isBlank()) {
            throw new IllegalArgumentException("Hóa đơn tiền mặt không nhận mã giao dịch ngân hàng");
        }
        String confirmationFingerprint = hash(request.getVersion() + "|" + bankTransactionId);
        if ("CONFIRMED".equals(order.getStatus())) {
            if (Objects.equals(order.getConfirmationKey(), idempotencyKey)) {
                if (!Objects.equals(order.getConfirmationFingerprint(), confirmationFingerprint)) {
                    throw conflict("Idempotency-Key xác nhận đã được dùng với nội dung khác.");
                }
                return toResponse(order);
            }
            return toResponse(order); // Retry sau khi server đã commit vẫn trả kết quả thật, không gia hạn lần hai.
        }
        if (!"PENDING_PAYMENT".equals(order.getStatus())) {
            throw conflict("Yêu cầu này không còn ở trạng thái chờ thanh toán.");
        }
        if (!Objects.equals(order.getVersion(), request.getVersion())) {
            throw conflict("Yêu cầu đã được cập nhật bởi người khác. Tải lại dữ liệu rồi thử lại.");
        }
        // Luôn khóa đơn trước, rồi thành viên; các lần xác nhận cùng người phải chờ nhau trước khi tính kỳ cuối.
        userRepository.findByIdForUpdate(order.getMemberId())
                .orElseThrow(() -> conflict("Thành viên của yêu cầu không còn tồn tại."));
        Invoice invoice = invoiceRepository.findByMembershipOrderId(orderId)
                .orElseThrow(() -> new IllegalStateException("Yêu cầu gói chưa có hóa đơn liên kết"));
        if (!"PENDING".equals(invoice.getPaymentStatus())) {
            throw conflict("Hóa đơn không còn chờ thanh toán.");
        }
        if (bankTransactionId != null && !bankTransactionId.isBlank()
                && orderRepository.existsByBankTransactionId(bankTransactionId)) {
            throw conflict("Mã giao dịch ngân hàng này đã được dùng cho yêu cầu khác.");
        }

        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        MemberSubscription source = null;
        LocalDate startDate = today;
        if (order.getSourceSubscriptionId() != null) {
            source = subscriptionRepository.findById(order.getSourceSubscriptionId())
                    .orElseThrow(() -> new IllegalStateException("Không tìm thấy gói cũ cần gia hạn"));
            // Đọc lại trạng thái nguồn sau khóa thành viên, kể cả entity đã có trong persistence context.
            entityManager.refresh(source, LockModeType.PESSIMISTIC_WRITE);
            if (!Objects.equals(source.getMemberId(), order.getMemberId())) {
                throw new IllegalStateException("Gói cũ không thuộc thành viên của đơn");
            }
            if ((!"ACTIVE".equals(source.getStatus()) && !"EXPIRED".equals(source.getStatus()))
                    || source.getStartDate() == null || source.getEndDate() == null
                    || source.getStartDate().isAfter(source.getEndDate())) {
                throw conflict("Kỳ nguồn không còn hợp lệ để gia hạn.");
            }
            // Kỳ ACTIVE tương lai đã được xác nhận cũng phải được giữ nguyên, không nối lại từ kỳ nguồn cũ.
            LocalDate lastEndDate = subscriptionRepository.findLastActiveEndDate(order.getMemberId()).orElse(null);
            if (lastEndDate != null && !lastEndDate.isBefore(today)) {
                startDate = lastEndDate.plusDays(1);
            }
        }
        LocalDate endDate = startDate.plusDays(order.getPackageDurationDays() - 1L);
        MemberSubscription subscription = MemberSubscription.builder()
                .memberId(order.getMemberId())
                .packageId(order.getPackageId())
                .startDate(startDate)
                .endDate(endDate)
                .status("ACTIVE")
                .build();
        subscription = subscriptionRepository.saveAndFlush(subscription);
        if (source != null && "ACTIVE".equals(source.getStatus()) && source.getEndDate().isBefore(today)) {
            source.setStatus("EXPIRED");
            subscriptionRepository.save(source);
        }

        LocalDateTime now = LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh"));
        invoice.setSubscriptionId(subscription.getId());
        invoice.setPaymentStatus("PAID");
        invoice.setPaidAt(now);
        invoice.setReceptionistId(gateway ? null : currentActorId());
        invoiceRepository.save(invoice);

        order.setStatus("CONFIRMED");
        order.setConfirmedAt(now);
        order.setConfirmedBy(gateway ? null : currentActorId());
        order.setBankTransactionId(bankTransactionId == null || bankTransactionId.isBlank() ? null : bankTransactionId);
        order.setConfirmationKey(idempotencyKey);
        order.setConfirmationFingerprint(confirmationFingerprint);
        order = orderRepository.saveAndFlush(order);
        // BỔ SUNG: lưu thông báo cùng transaction; lỗi sẽ rollback, không báo gia hạn thành công giả.
        notifications.notifyConfirmed(order, invoice, subscription);
        return toResponse(order);
    }

    private MembershipOrderResponse toResponse(MembershipOrder order) {
        Invoice invoice = invoiceRepository.findByMembershipOrderId(order.getId()).orElse(null);
        MemberSubscription subscription = invoice == null || invoice.getSubscriptionId() == null ? null
                : subscriptionRepository.findById(invoice.getSubscriptionId()).orElse(null);
        var member = userRepository.findById(order.getMemberId()).orElse(null);
        // BỔ SUNG: ghép trạng thái đối soát và thông báo vào response để FE polling đúng dữ liệu đã lưu.
        var lastEvent = invoice == null ? null : bankEvents.findFirstByInvoiceIdOrderByIdDesc(invoice.getId()).orElse(null);
        java.math.BigDecimal received = invoice == null ? java.math.BigDecimal.ZERO : bankEvents.receivedTotal(invoice.getId());
        return MembershipOrderResponse.builder()
                .memberName(member == null ? null : member.getFullName())
                .bankAccount(order.getBankAccountNoSnapshot() == null ? null : new BankAccountData(order.getBankBinSnapshot(),
                        order.getBankNameSnapshot(), order.getBankAccountNoSnapshot(), order.getBankAccountNameSnapshot(), order.getBankGatewaySnapshot()))
                .bankTransfer(!"BANK_TRANSFER".equals(order.getPaymentMethod()) || !"PENDING_PAYMENT".equals(order.getStatus()) ? null :
                        new MembershipOrderResponse.BankTransfer(received.signum() == 0 ? "WAITING" : "AMOUNT_MISMATCH", received,
                                lastEvent == null ? null : "SEPAY-" + lastEvent.getProviderEventId(), paymentProperties.ready() && order.getBankAccountNoSnapshot() != null))
                .delivery(notifications.status(order.getId()))
                .id(order.getId())
                .memberId(order.getMemberId())
                .kind(order.getKind())
                .sourceSubscriptionId(order.getSourceSubscriptionId())
                .sourcePackageId(order.getSourcePackageId())
                .status(order.getStatus())
                .packageInfo(MembershipOfferResponse.builder()
                        .id(order.getPackageId())
                        .name(order.getPackageName())
                        .price(order.getPackagePrice())
                        .payableAmount(payable(order)).demoPayment(order.isDemoPayment())
                        .durationDays(order.getPackageDurationDays())
                        .status(order.getPackageStatus())
                        .description(packageRepository.findById(order.getPackageId()).map(MembershipPackage::getDescription).orElse(null))
                        .build())
                .invoice(invoice == null ? null : toInvoiceResponse(invoice))
                .paymentReference(invoice == null ? null : "HD" + invoice.getId() + " TV" + order.getMemberId())
                .createdAt(order.getCreatedAt())
                .confirmedAt(order.getConfirmedAt())
                .subscription(toSubscriptionResponse(subscription))
                .version(order.getVersion())
                .build();
    }

    private MembershipOfferResponse toOffer(MembershipPackage pkg) {
        return MembershipOfferResponse.builder().id(pkg.getId()).name(pkg.getPackageName())
                .payableAmount(paymentProperties.qrAmount(pkg.getId(), pkg.getPrice())).demoPayment(paymentProperties.demoFor(pkg.getId()))
                .price(pkg.getPrice()).durationDays(pkg.getDurationDays()).status(pkg.getStatus())
                .description(pkg.getDescription()).build();
    }

    /** Đơn cũ chưa có snapshot khoản thu thì giữ đúng giá đã lưu, không tự giảm đơn/hóa đơn cũ. */
    private java.math.BigDecimal payable(MembershipOrder order) {
        return order.getPayableAmountSnapshot() == null ? order.getPackagePrice() : order.getPayableAmountSnapshot();
    }

    private InvoiceResponse toInvoiceResponse(Invoice invoice) {
        return InvoiceResponse.builder().id(invoice.getId()).subscriptionId(invoice.getSubscriptionId())
                .membershipOrderId(invoice.getMembershipOrderId()).memberId(invoice.getMemberId())
                .receptionistId(invoice.getReceptionistId()).amount(invoice.getAmount()).currency(invoice.getCurrency())
                .paymentMethod(invoice.getPaymentMethod()).paymentStatus(invoice.getPaymentStatus())
                .createdAt(invoice.getCreatedAt()).paidAt(invoice.getPaidAt()).refundedAt(invoice.getRefundedAt()).build();
    }

    private MemberSubscriptionResponse toSubscriptionResponse(MemberSubscription subscription) {
        if (subscription == null) return null;
        return MemberSubscriptionResponse.builder().id(subscription.getId()).memberId(subscription.getMemberId())
                .packageId(subscription.getPackageId()).startDate(subscription.getStartDate())
                .endDate(subscription.getEndDate()).status(subscription.getStatus()).build();
    }

    private Integer currentActorId() {
        Integer actorId = securityUtils.getCurrentUserId();
        if (actorId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ.");
        return actorId;
    }

    private void ensureCanRead(MembershipOrder order) {
        if (!isStaff() && !Objects.equals(currentActorId(), order.getMemberId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn không có quyền xem yêu cầu của thành viên này.");
        }
    }

    private boolean isStaff() {
        return securityUtils.isReceptionist() || securityUtils.isCenterManager();
    }

    private void validateIdempotencyKey(String key) {
        if (key == null || key.isBlank() || key.length() > 100) {
            throw new IllegalArgumentException("Header Idempotency-Key là bắt buộc và tối đa 100 ký tự");
        }
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    private String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Không tạo được dấu vân tay yêu cầu", exception);
        }
    }
}
