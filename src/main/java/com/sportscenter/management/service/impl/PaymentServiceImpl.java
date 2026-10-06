package com.sportscenter.management.service.impl;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.entity.Invoice;
import com.sportscenter.management.entity.MemberSubscription;
import com.sportscenter.management.repository.InvoiceRepository;
import com.sportscenter.management.repository.MemberSubscriptionRepository;
import com.sportscenter.management.repository.UserRepository;
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
    private final UserRepository userRepository;

    @Override
    public InvoiceResponse createInvoice(InvoiceRequest request) {
        if (request == null || request.getMemberId() == null) {
            throw new IllegalArgumentException("Thông tin hóa đơn và thành viên là bắt buộc");
        }
        // Validate member exists
        if (!userRepository.existsById(request.getMemberId())) {
            throw new IllegalArgumentException("Thành viên không tồn tại");
        }

        // Validate subscription if provided
        if (request.getSubscriptionId() != null) {
            MemberSubscription subscription = subscriptionRepository.findById(request.getSubscriptionId())
                    .orElseThrow(() -> new IllegalArgumentException("Đăng ký không tồn tại"));

            if (!subscription.getMemberId().equals(request.getMemberId())) {
                throw new IllegalArgumentException("Đăng ký không thuộc về thành viên này");
            }
        }
        if (request.getReceptionistId() != null && !userRepository.existsById(request.getReceptionistId())) {
            throw new IllegalArgumentException("Nhân viên thu ngân không tồn tại");
        }

        // Validate amount is positive
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Số tiền phải lớn hơn 0");
        }

        // Validate payment method
        if (!isValidPaymentMethod(request.getPaymentMethod())) {
            throw new IllegalArgumentException("Phương thức thanh toán không hợp lệ");
        }
        String paymentStatus = request.getPaymentStatus() != null ? request.getPaymentStatus() : "PAID";
        if (!isValidPaymentStatus(paymentStatus)) {
            throw new IllegalArgumentException("Trạng thái thanh toán không hợp lệ");
        }

        Invoice invoice = Invoice.builder()
                .subscriptionId(request.getSubscriptionId())
                .memberId(request.getMemberId())
                .receptionistId(request.getReceptionistId())
                .amount(request.getAmount())
                .paymentMethod(request.getPaymentMethod())
                .paymentStatus(paymentStatus)
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

        if (!"PENDING".equals(invoice.getPaymentStatus())) {
            throw new IllegalArgumentException("Chỉ hóa đơn đang chờ thanh toán mới có thể được thanh toán");
        }

        invoice.setPaymentStatus("PAID");
        Invoice updatedInvoice = invoiceRepository.save(invoice);
        return mapToResponse(updatedInvoice);
    }

    @Override
    public InvoiceResponse refundInvoice(Integer invoiceId) {
        Invoice invoice = invoiceRepository.findById(invoiceId)
                .orElseThrow(() -> new IllegalArgumentException("Hóa đơn không tồn tại"));

        if (!"PAID".equals(invoice.getPaymentStatus())) {
            throw new IllegalArgumentException("Chỉ có thể hoàn tiền cho hóa đơn đã thanh toán");
        }

        invoice.setPaymentStatus("REFUNDED");
        Invoice updatedInvoice = invoiceRepository.save(invoice);
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
                .memberId(invoice.getMemberId())
                .receptionistId(invoice.getReceptionistId())
                .amount(invoice.getAmount())
                .paymentMethod(invoice.getPaymentMethod())
                .paymentStatus(invoice.getPaymentStatus())
                .createdAt(invoice.getCreatedAt())
                .build();
    }

    private boolean isValidPaymentMethod(String method) {
        return "CASH".equals(method) || "CREDIT_CARD".equals(method) ||
                "BANK_TRANSFER".equals(method) || "VNPAY".equals(method);
    }

    private boolean isValidPaymentStatus(String status) {
        return "PAID".equals(status) || "PENDING".equals(status) || "REFUNDED".equals(status);
    }
}
