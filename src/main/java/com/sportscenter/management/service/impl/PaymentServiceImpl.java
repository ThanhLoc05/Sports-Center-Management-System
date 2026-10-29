package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MembershipPackageRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class PaymentServiceImpl implements PaymentService {

    private final InvoiceRepository invoiceRepository;
    private final MemberSubscriptionRepository subscriptionRepository;
    private final MembershipPackageRepository packageRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

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

        if (invoice.getMembershipOrderId() != null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Hóa đơn gói phải được xác nhận trong yêu cầu gói để đồng bộ tiền và thời hạn.");
        }

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
            subscriptionRepository.findById(updatedInvoice.getSubscriptionId()).ifPresent(sub -> {
                sub.setStatus("ACTIVE");
                subscriptionRepository.save(sub);
            });
        }

        return mapToResponse(updatedInvoice);
    }

    @Override
    public InvoiceResponse refundInvoice(Integer invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));

        if (invoice.getMembershipOrderId() != null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.CONFLICT,
                    "Hóa đơn thuộc yêu cầu gói; luồng hoàn tiền cho yêu cầu này chưa được mở.");
        }

        if (!"PAID".equals(invoice.getPaymentStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hoàn tiền cho hóa đơn đã thanh toán");
        }

        invoice.setPaymentStatus("REFUNDED");
        invoice.setRefundedAt(LocalDateTime.now());
        Invoice updatedInvoice = invoiceRepository.save(invoice);

        // Hoàn toàn bộ hóa đơn gói thì hủy subscription liên quan theo chính sách hiện tại.
        if (updatedInvoice.getSubscriptionId() != null) {
            subscriptionRepository.findById(updatedInvoice.getSubscriptionId()).ifPresent(sub -> {
                sub.setStatus("CANCELLED");
                subscriptionRepository.save(sub);
            });
        }

        return mapToResponse(updatedInvoice);
    }

    @Override
    @Transactional(readOnly = true)
    public BigDecimal calculateTotalRevenue(LocalDateTime startDate, LocalDateTime endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Ngày bắt đầu và ngày kết thúc không được để trống");
        }

        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Ngày bắt đầu phải trước ngày kết thúc");
        }

        return invoiceRepository.calculateTotalRevenue(startDate, endDate);
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

        List<Invoice> invoices = invoiceRepository.findByPaymentStatusAndCreatedAtBetween("PAID", startDate, endDate);

        StringBuilder report = new StringBuilder();
        invoices.stream()
                .collect(Collectors.groupingBy(Invoice::getPaymentMethod,
                        Collectors.reducing(BigDecimal.ZERO, Invoice::getAmount, BigDecimal::add)))
                .forEach((method, total) -> report.append(method).append(": ").append(total).append(" VND\n"));

        return report.toString();
    }

    private InvoiceResponse mapToResponse(Invoice invoice) {
        return InvoiceResponse.builder()
                .id(invoice.getId())
                .subscriptionId(invoice.getSubscriptionId())
                .membershipOrderId(invoice.getMembershipOrderId())
                .memberId(invoice.getMemberId())
                .receptionistId(invoice.getReceptionistId())
                .amount(invoice.getAmount())
                .currency(invoice.getCurrency())
                .paymentMethod(invoice.getPaymentMethod())
                .paymentStatus(invoice.getPaymentStatus())
                .createdAt(invoice.getCreatedAt())
                .paidAt(invoice.getPaidAt())
                .refundedAt(invoice.getRefundedAt())
                .build();
    }

    private boolean isValidPaymentMethod(String method) {
        return "CASH".equals(method) || "CREDIT_CARD".equals(method)
                || "BANK_TRANSFER".equals(method) || "VNPAY".equals(method)
                || "MOMO".equals(method) || "ZALOPAY".equals(method) || "PAYOS".equals(method);
    }

}
