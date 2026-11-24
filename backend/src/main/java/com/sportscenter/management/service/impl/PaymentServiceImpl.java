package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.MemberRefundRequest;
import com.sportscenter.management.dto.Request.RefundRequest;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.dto.Response.RevenueSummaryResponse;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.entity.MembershipOrder;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.MembershipOrderRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.service.PaymentService;
import lombok.RequiredArgsConstructor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.sportscenter.management.dto.Response.RefundQuote;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class PaymentServiceImpl implements PaymentService {

    private final InvoiceRepository invoiceRepository;
    private final MemberSubscriptionRepository subscriptionRepository;
    private final MembershipOrderRepository orderRepository;
    private final MembershipPackageRepository packageRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;
    private final RefundBookings refundBookings;
    private static final ZoneId CENTER_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    public InvoiceResponse createInvoice(InvoiceRequest request) {
        if (request == null || request.getMemberId() == null) {
            throw new IllegalArgumentException("Thông tin hóa đơn và thành viên là bắt buộc");
        }
        // Chỉ lập hóa đơn cho tài khoản thành viên có thật.
        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        BigDecimal invoiceAmount = request.getAmount();

        // Hóa đơn gói phải lấy giá từ danh mục, không tin số tiền do client gửi lên.
        // Nếu gói đã có hóa đơn đang chờ thì dùng lại hóa đơn đó, tránh thu trùng.
        if (request.getSubscriptionId() != null) {
            MemberSubscription subscription = subscriptionRepository.findById(request.getSubscriptionId())
                    .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));

            if (!subscription.getMemberId().equals(request.getMemberId())) {
                throw new IllegalArgumentException("Đăng ký không thuộc về thành viên này");
            }

            var existingInvoice = invoiceRepository
                    .findFirstBySubscriptionIdOrderByCreatedAtDesc(request.getSubscriptionId());
            if (existingInvoice.isPresent()) {
                if ("PENDING".equals(existingInvoice.get().getPaymentStatus())) {
                    return mapToResponse(existingInvoice.get());
                }
                throw new IllegalArgumentException("Đăng ký này đã có hóa đơn được xử lý");
            }

            invoiceAmount = packageRepository.findById(subscription.getPackageId())
                    .orElseThrow(() -> new IllegalArgumentException("Gói hội viên không tồn tại"))
                    .getPrice();
        }

        // Người đang đăng nhập là người lập hóa đơn; không dùng mã nhân viên do client tự gửi.
        Integer receptionistId = securityUtils.getCurrentUserId();

        if (receptionistId != null && !userRepository.existsById(receptionistId)) {
            throw new IllegalArgumentException("Nhân viên thu ngân không tồn tại");
        }

        // Hóa đơn thủ công phải có số tiền dương.
        if (invoiceAmount == null || invoiceAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Số tiền phải lớn hơn 0");
        }

        // Nếu chưa chọn phương thức thì mặc định là tiền mặt tại quầy.
        String paymentMethod = request.getPaymentMethod() == null ? "CASH" : request.getPaymentMethod();
        if (!isValidPaymentMethod(paymentMethod)) {
            throw new IllegalArgumentException("Phương thức thanh toán không hợp lệ");
        }
        Invoice invoice = Invoice.builder()
                .subscriptionId(request.getSubscriptionId())
                .memberId(request.getMemberId())
                .receptionistId(receptionistId)
                .amount(invoiceAmount)
                .currency("VND")
                .paymentMethod(paymentMethod)
                .paymentStatus("PENDING")
                .createdAt(LocalDateTime.now())
                .build();

        Invoice savedInvoice = invoiceRepository.save(invoice);

        return mapToResponse(savedInvoice);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<InvoiceResponse> getInvoiceById(Integer invoiceId) {
        return invoiceRepository.findById(invoiceId)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InvoiceResponse> getMemberInvoices(Integer memberId) {
        if (!userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        return invoiceRepository.findByMemberId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    public InvoiceResponse markAsPaid(Integer invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));
        if (invoice.getCourseOrderId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Hãy xác nhận thanh toán trong đơn khóa học.");
        }
        if (invoice.getMembershipOrderId() != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Hóa đơn thuộc yêu cầu đăng ký/gia hạn; hãy xác nhận thanh toán trong luồng đơn hàng.");
        }
        userRepository.findByIdForUpdate(invoice.getMemberId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Thành viên của hóa đơn không còn tồn tại."));
        invoice = invoiceRepository.findByIdForUpdate(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));
        // The earlier read may still be cached even though the lock query waited for another transaction.
        entityManager.refresh(invoice, LockModeType.PESSIMISTIC_WRITE);

        if (!"PENDING".equals(invoice.getPaymentStatus())) {
            throw new IllegalArgumentException("Chỉ hóa đơn đang chờ thanh toán mới có thể được thanh toán");
        }

        invoice.setPaymentStatus("PAID");
        invoice.setPaidAt(LocalDateTime.now());
        Integer receptionistId = securityUtils.getCurrentUserId();
        if (receptionistId != null) {
            invoice.setReceptionistId(receptionistId);
        }
        Invoice updatedInvoice = invoiceRepository.save(invoice);

        // Chỉ kích hoạt subscription sau khi nhân viên xác nhận hóa đơn đã thu.
        if (updatedInvoice.getSubscriptionId() != null) {
            subscriptionRepository.findByIdForUpdate(updatedInvoice.getSubscriptionId()).ifPresent(sub -> {
                sub.setStatus("ACTIVE");
                subscriptionRepository.save(sub);
            });
        }

        return mapToResponse(updatedInvoice);
    }

    @Override
    @Transactional(readOnly = true)
    public RefundQuote quoteRefund(Integer invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));
        if (!securityUtils.isOwnerOrAuthorized(invoice.getMemberId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chỉ được xem hóa đơn của mình.");
        var order = invoice.getMembershipOrderId() == null ? null :
                orderRepository.findById(invoice.getMembershipOrderId()).orElse(null);
        return quote(invoice, order, LocalDate.now(CENTER_ZONE));
    }

    // [FLOW 3] QUY TẮC MỨC HOÀN: hóa đơn PAID của đơn gói đã xác nhận; trong 3 ngày từ ngày đăng ký; ngày đầu 100%, ngày 2-3 90%.
    static RefundQuote quote(Invoice invoice, MembershipOrder order, LocalDate today) {
        if (!"PAID".equals(invoice.getPaymentStatus()) || invoice.getRefundedAt() != null)
            throw new IllegalArgumentException("Chỉ được hoàn hóa đơn đã thanh toán và chưa hoàn.");
        if (order == null || !"CONFIRMED".equals(order.getStatus()) || invoice.getSubscriptionId() == null ||
                !Objects.equals(order.getMemberId(), invoice.getMemberId()) || order.getCreatedAt() == null)
            throw new IllegalArgumentException("Chỉ hoàn hóa đơn có đơn đăng ký hoặc gia hạn gói đã xác nhận.");
        LocalDate registered = order.getCreatedAt().toLocalDate();
        // Giữ mức hoàn đã chốt khi thành viên gửi yêu cầu, kể cả khi xử lý sang ngày khác.
        if (invoice.getRefundRequestedAt() != null)
            return new RefundQuote(registered, registered.plusDays(2), invoice.getRefundRequestedPercent(), invoice.getRefundRequestedAmount());
        long age = ChronoUnit.DAYS.between(registered, today);
        if (age < 0 || age >= 3)
            throw new IllegalArgumentException("Hóa đơn nằm ngoài hạn hoàn 3 ngày tính từ ngày đăng ký.");
        int percent = age == 0 ? 100 : 90;
        BigDecimal amount = invoice.getAmount().multiply(BigDecimal.valueOf(percent))
                .movePointLeft(2).setScale(0, RoundingMode.HALF_UP);
        return new RefundQuote(registered, registered.plusDays(2), percent, amount);
    }

    private record LockedRefund(Invoice invoice, MembershipOrder order) {}

    private LockedRefund lockRefund(Integer invoiceId, Integer ownerId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));
        if (ownerId != null && !ownerId.equals(invoice.getMemberId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bạn chỉ được gửi yêu cầu cho hóa đơn của mình.");
        MembershipOrder order = null;
        if (invoice.getMembershipOrderId() != null) {
            order = orderRepository.findByIdForUpdate(invoice.getMembershipOrderId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT,
                            "Không tìm thấy đơn hàng liên kết với hóa đơn."));
            if (!Objects.equals(order.getMemberId(), invoice.getMemberId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Hóa đơn không khớp thành viên của đơn hàng.");
            }
        }
        userRepository.findByIdForUpdate(invoice.getMemberId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Thành viên của hóa đơn không còn tồn tại."));
        invoice = invoiceRepository.findByIdForUpdate(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));
        entityManager.refresh(invoice, LockModeType.PESSIMISTIC_WRITE);
        if (!Objects.equals(invoice.getMembershipOrderId(),
                order == null ? null : order.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Liên kết hóa đơn đã thay đổi; hãy tải lại dữ liệu.");
        }

        if (ownerId != null && !ownerId.equals(invoice.getMemberId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Hóa đơn không thuộc thành viên.");
        return new LockedRefund(invoice, order);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InvoiceResponse> pendingRefundRequests() {
        return invoiceRepository.findByPaymentStatusAndRefundRequestedAtIsNotNullOrderByRefundRequestedAtAscIdAsc("PAID")
                .stream().map(this::mapToResponse).toList();
    }

    @Override
    // [FLOW 3] MEMBER GỬI YÊU CẦU HOÀN: chốt mức hoàn tại thời điểm gửi, chưa trả tiền.
    public InvoiceResponse requestRefund(Integer invoiceId, MemberRefundRequest request) {
        Integer ownerId = securityUtils.getCurrentUserId();
        if (ownerId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var locked = lockRefund(invoiceId, ownerId);
        var invoice = locked.invoice();
        if (invoice.getRefundRequestedAt() != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Hóa đơn đã có yêu cầu hoàn tiền.");
        LocalDateTime now = LocalDateTime.now(CENTER_ZONE);
        RefundQuote offer = quote(invoice, locked.order(), now.toLocalDate());
        if (offer.amount().compareTo(request.expectedAmount()) != 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Mức hoàn vừa thay đổi. Vui lòng kiểm tra lại trước khi gửi.");
        invoice.setRefundRequestedAt(now);
        invoice.setRefundRequestReason(request.reason().trim());
        invoice.setRefundRequestedAmount(offer.amount());
        invoice.setRefundRequestedPercent(offer.percent());
        return mapToResponse(invoiceRepository.save(invoice));
    }

    @Override
    // [FLOW 3] GHI NHẬN HOÀN TIỀN MẶT: khóa dữ liệu -> kiểm tra mã HD.. TV.. và số tiền -> hóa đơn/đơn REFUNDED -> hủy gói -> hủy lớp không còn gói bao phủ.
    public InvoiceResponse refundInvoice(Integer invoiceId, RefundRequest request) {
        var locked = lockRefund(invoiceId, null);
        Invoice invoice = locked.invoice();
        MembershipOrder order = locked.order();
        LocalDateTime now = LocalDateTime.now(CENTER_ZONE);
        RefundQuote quote = quote(invoice, order, now.toLocalDate());
        String paymentReference = invoice.paymentReference();
        if (request.reference() == null || !paymentReference.equals(request.reference().trim()))
            throw new IllegalArgumentException("Mã thanh toán không khớp với hóa đơn đang hoàn.");
        if (quote.amount().compareTo(request.expectedAmount()) != 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Số tiền hoàn đã thay đổi. Hãy đối chiếu lại chứng từ.");
        Integer memberId = invoice.getMemberId();
        var sub = subscriptionRepository.findByIdForUpdate(invoice.getSubscriptionId())
                .filter(s -> Objects.equals(s.getMemberId(), memberId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Không tìm thấy gói của thành viên trên hóa đơn."));
        var covered = refundBookings.covered(invoice.getMemberId(), now);
        invoice.setRefundedAmount(quote.amount());

        invoice.setRefundReason(request.reason().trim());
        // [FLOW 3] Trung tâm chỉ hoàn tiền mặt: luôn lưu phương thức hoàn là CASH.
        invoice.setRefundMethod("CASH");
        invoice.setRefundReference(paymentReference);
        invoice.setRefundedBy(securityUtils.getCurrentUserId());
        invoice.setPaymentStatus("REFUNDED");
        invoice.setRefundedAt(now);
        Invoice updatedInvoice = invoiceRepository.save(invoice);

        order.setStatus("REFUNDED");
        orderRepository.save(order);
        // [FLOW 3] HỦY GÓI của hóa đơn bị hoàn; nếu gói cũ đã được cộng dồn vào thì khôi phục gói cũ.
        SubscriptionRollover.cancel(sub, subscriptionRepository.findByMemberId(memberId), now.toLocalDate());
        entityManager.flush();
        // [FLOW 3] HỦY CÁC LỚP đã đăng ký mà gói còn lại không bao phủ, kèm thông báo cho Member.
        refundBookings.cancelUncovered(covered, memberId, invoice.getRefundedBy(), invoiceId, now);

        return mapToResponse(updatedInvoice);
    }

    @Override
    @Transactional(readOnly = true)
    // [FLOW 3] DOANH THU RÒNG = tổng thu (theo ngày thanh toán) - tổng hoàn (theo ngày hoàn).
    public BigDecimal calculateTotalRevenue(LocalDateTime startDate, LocalDateTime endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        BigDecimal gross = invoiceRepository.calculateTotalRevenue(startDate, endDate);
        BigDecimal refunded = invoiceRepository.calculateTotalRefunded(startDate, endDate);
        return gross.subtract(refunded);
    }

    @Override
    @Transactional(readOnly = true)
    public List<InvoiceResponse> getPendingInvoices() {
        return invoiceRepository.findByPaymentStatus("PENDING").stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public String getRevenueByPaymentMethod(LocalDateTime startDate, LocalDateTime endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        List<Invoice> invoices = invoiceRepository.findCollectedInvoicesBetween(startDate, endDate);

        StringBuilder report = new StringBuilder();
        invoices.stream()
                .collect(Collectors.groupingBy(Invoice::getPaymentMethod,
                        Collectors.reducing(BigDecimal.ZERO, Invoice::getAmount, BigDecimal::add)))
                .forEach((method, total) -> report.append(method).append(": ").append(total).append(" VND\n"));

        return report.toString();
    }

    @Override
    @Transactional(readOnly = true)
    // [FLOW 3] BÁO CÁO TỔNG HỢP: tổng thu, tiền hoàn, doanh thu ròng, số hóa đơn đã thu/đã hoàn, doanh thu theo phương thức.
    public RevenueSummaryResponse getRevenueSummary(LocalDateTime startDate, LocalDateTime endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        BigDecimal gross = invoiceRepository.calculateTotalRevenue(startDate, endDate);
        BigDecimal refunded = invoiceRepository.calculateTotalRefunded(startDate, endDate);
        BigDecimal net = gross.subtract(refunded);
        long paidCount = invoiceRepository.countCollectedInvoices(startDate, endDate);
        long refundedCount = invoiceRepository.countRefundedInvoices(startDate, endDate);

        List<Invoice> collectedInvoices = invoiceRepository.findCollectedInvoicesBetween(startDate, endDate);
        Map<String, BigDecimal> byMethod = collectedInvoices.stream()
                .collect(Collectors.groupingBy(Invoice::getPaymentMethod,
                        Collectors.reducing(BigDecimal.ZERO, Invoice::getAmount, BigDecimal::add)));

        return RevenueSummaryResponse.builder()
                .startDate(startDate)
                .endDate(endDate)
                .totalGrossRevenue(gross)
                .totalRefunded(refunded)
                .netRevenue(net)
                .totalPaidInvoices(paidCount)
                .totalRefundedInvoices(refundedCount)
                .revenueByMethod(byMethod)
                .dailyRevenue(dailyRevenue(collectedInvoices,
                        invoiceRepository.findRefundedInvoicesBetween(startDate, endDate),
                        startDate.toLocalDate(), endDate.toLocalDate()))
                .build();
    }

    /**
     * [FLOW 3] DOANH THU TỪNG NGÀY cho biểu đồ/bảng báo cáo.
     * Thu cộng vào ngày thanh toán (paidAt), hoàn trừ vào ngày hoàn (refundedAt) - đúng công thức các ô tổng,
     * nên cộng tất cả các ngày luôn bằng tổng thu / tổng hoàn / doanh thu ròng của kỳ.
     * Giới hạn 1100 ngày (khoảng 3 năm) để response không quá lớn.
     */
    static List<com.sportscenter.management.dto.Response.RevenuePoint> dailyRevenue(
            List<Invoice> collected, List<Invoice> refunded, LocalDate from, LocalDate to) {
        if (from.isAfter(to) || ChronoUnit.DAYS.between(from, to) > 1100) return List.of();
        Map<LocalDate, BigDecimal> gross = new java.util.HashMap<>();
        for (Invoice invoice : collected) {
            LocalDateTime at = invoice.getPaidAt() != null ? invoice.getPaidAt() : invoice.getCreatedAt();
            if (at != null && invoice.getAmount() != null)
                gross.merge(at.toLocalDate(), invoice.getAmount(), BigDecimal::add);
        }
        Map<LocalDate, BigDecimal> returned = new java.util.HashMap<>();
        for (Invoice invoice : refunded) {
            LocalDateTime at = invoice.getRefundedAt() != null ? invoice.getRefundedAt() : invoice.getCreatedAt();
            BigDecimal amount = invoice.getRefundedAmount() != null ? invoice.getRefundedAmount() : invoice.getAmount();
            if (at != null && amount != null) returned.merge(at.toLocalDate(), amount, BigDecimal::add);
        }
        List<com.sportscenter.management.dto.Response.RevenuePoint> points = new java.util.ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            BigDecimal in = gross.getOrDefault(day, BigDecimal.ZERO);
            BigDecimal out = returned.getOrDefault(day, BigDecimal.ZERO);
            points.add(com.sportscenter.management.dto.Response.RevenuePoint.builder()
                    .date(day).gross(in).refunded(out).net(in.subtract(out)).build());
        }
        return points;
    }

    private InvoiceResponse mapToResponse(Invoice invoice) {
        return InvoiceResponse.builder()
                .id(invoice.getId())
                .subscriptionId(invoice.getSubscriptionId())
                .membershipOrderId(invoice.getMembershipOrderId())
                .courseOrderId(invoice.getCourseOrderId())
                .memberId(invoice.getMemberId())
                .receptionistId(invoice.getReceptionistId())
                .amount(invoice.getAmount())
                .currency(invoice.getCurrency())
                .paymentMethod(invoice.getPaymentMethod())
                .paymentStatus(invoice.getPaymentStatus())
                .createdAt(invoice.getCreatedAt())
                .paidAt(invoice.getPaidAt())
                .refundedAt(invoice.getRefundedAt())
                .refundReason(invoice.getRefundReason())
                .refundRequestedAt(invoice.getRefundRequestedAt())
                .refundRequestReason(invoice.getRefundRequestReason())
                .refundRequestedAmount(invoice.getRefundRequestedAmount())
                .refundRequestedPercent(invoice.getRefundRequestedPercent())
                .refundedAmount(invoice.getRefundedAmount())
                .refundMethod(invoice.getRefundMethod())
                .refundReference(invoice.getRefundReference())
                .refundedBy(invoice.getRefundedBy())
                .build();
    }

    private boolean isValidPaymentMethod(String method) {
        return "CASH".equals(method) || "CREDIT_CARD".equals(method)
                || "BANK_TRANSFER".equals(method) || "VNPAY".equals(method)
                || "MOMO".equals(method) || "ZALOPAY".equals(method) || "PAYOS".equals(method);
    }
}
