package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.service.PaymentService;
import com.sportscenter.auth.SecurityUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * ============================================================================
 * CONTROLLER QUẢN LÝ THANH TOÁN & HÓA ĐƠN (PAYMENT & INVOICE MANAGEMENT)
 * ============================================================================
 * Nghiệp vụ và phân quyền:
 * 1. Lập hóa đơn (POST /invoices): Lễ tân (RECEPTIONIST) và Quản lý trung tâm (CENTER_MANAGER).
 * 2. Xác nhận đã thu tiền (POST /invoices/{id}/pay): Lễ tân và Quản lý.
 * 3. Hoàn tiền hóa đơn (POST /invoices/{id}/refund): CHỈ Quản lý trung tâm (CENTER_MANAGER).
 * 4. Báo cáo doanh thu (GET /revenue): CHỈ Quản lý trung tâm (CENTER_MANAGER).
 * 5. Tra cứu hóa đơn của học viên: Học viên chỉ xem được hóa đơn của mình, Lễ tân/Quản lý xem được tất cả.
 */
@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;
    private final SecurityUtils securityUtils;

    /**
     * LẬP HÓA ĐƠN MỚI TẠI QUẦY
     * - Dành cho Lễ tân và Quản lý khi học viên thanh toán gói tập.
     */
    @PostMapping("/invoices")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<InvoiceResponse> createInvoice(@Valid @RequestBody InvoiceRequest request) {
        return ResponseEntity.status(201).body(paymentService.createInvoice(request));
    }

    /**
     * XEM CHI TIẾT 1 HÓA ĐƠN THEO ID
     * - Bảo mật: Chỉ chủ nhân hóa đơn hoặc Lễ tân/Quản lý mới được xem chi tiết.
     */
    @GetMapping("/invoices/{invoiceId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<InvoiceResponse> getInvoice(@PathVariable Integer invoiceId) {
        var invoiceOpt = paymentService.getInvoiceById(invoiceId);
        if (invoiceOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        InvoiceResponse invoice = invoiceOpt.get();
        if (!securityUtils.isOwnerOrAuthorized(invoice.getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(invoice);
    }

    /**
     * XEM DANH SÁCH TẤT CẢ HÓA ĐƠN CỦA MỘT HỌC VIÊN
     * - Bảo mật: Học viên chỉ xem hóa đơn của mình; Lễ tân/Quản lý xem được để hỗ trợ đối soát tiền.
     */
    @GetMapping("/members/{memberId}/invoices")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<InvoiceResponse>> getMemberInvoices(@PathVariable Integer memberId) {
        if (!securityUtils.isOwnerOrAuthorized(memberId)) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(paymentService.getMemberInvoices(memberId));
    }

    /**
     * DANH SÁCH CÁC HÓA ĐƠN CHỜ THANH TOÁN (PENDING)
     * - Lễ tân và Quản lý theo dõi để nhắc nhở và thu tiền học viên.
     */
    @GetMapping("/invoices/pending")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public List<InvoiceResponse> getPendingInvoices() {
        return paymentService.getPendingInvoices();
    }

    /**
     * XÁC NHẬN ĐÃ THU TIỀN HÓA ĐƠN (MARK AS PAID)
     * - Lễ tân và Quản lý bấm xác nhận khi nhận tiền mặt, quẹt thẻ hoặc chuyển khoản.
     */
    @PostMapping("/invoices/{invoiceId}/pay")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public InvoiceResponse markAsPaid(@PathVariable Integer invoiceId) {
        return paymentService.markAsPaid(invoiceId);
    }

    /**
     * HOÀN TIỀN CHO HỌC VIÊN (REFUND)
     * - Bảo mật chặt: CHỈ Quản lý trung tâm (CENTER_MANAGER) mới có thẩm quyền duyệt hoàn tiền.
     */
    @PostMapping("/invoices/{invoiceId}/refund")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public InvoiceResponse refund(@PathVariable Integer invoiceId) {
        return paymentService.refundInvoice(invoiceId);
    }

    /**
     * BÁO CÁO TỔNG DOANH THU THEO KHOẢNG THỜI GIAN
     * - Bảo mật chặt: CHỈ Quản lý mới được xem doanh thu tài chính của trung tâm.
     */
    @GetMapping("/revenue")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public BigDecimal getRevenue(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {
        return paymentService.calculateTotalRevenue(startDate, endDate);
    }

    /**
     * BÁO CÁO DOANH THU THEO PHƯƠNG THỨC THANH TOÁN (Tiền mặt / Chuyển khoản / Thẻ)
     * - Bảo mật: CHỈ Quản lý trung tâm (CENTER_MANAGER).
     */
    @GetMapping("/revenue/by-method")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public String getRevenueByMethod(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {
        return paymentService.getRevenueByPaymentMethod(startDate, endDate);
    }
}
