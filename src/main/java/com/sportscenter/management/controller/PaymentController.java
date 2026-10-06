package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping("/invoices")
    public ResponseEntity<InvoiceResponse> createInvoice(@RequestBody InvoiceRequest request) {
        return ResponseEntity.status(201).body(paymentService.createInvoice(request));
    }

    @GetMapping("/invoices/{invoiceId}")
    public ResponseEntity<InvoiceResponse> getInvoice(@PathVariable Integer invoiceId) {
        return paymentService.getInvoiceById(invoiceId).map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/members/{memberId}/invoices")
    public List<InvoiceResponse> getMemberInvoices(@PathVariable Integer memberId) {
        return paymentService.getMemberInvoices(memberId);
    }

    @GetMapping("/invoices/pending")
    public List<InvoiceResponse> getPendingInvoices() {
        return paymentService.getPendingInvoices();
    }

    @PostMapping("/invoices/{invoiceId}/pay")
    public InvoiceResponse markAsPaid(@PathVariable Integer invoiceId) {
        return paymentService.markAsPaid(invoiceId);
    }

    @PostMapping("/invoices/{invoiceId}/refund")
    public InvoiceResponse refund(@PathVariable Integer invoiceId) {
        return paymentService.refundInvoice(invoiceId);
    }

    @GetMapping("/revenue")
    public BigDecimal getRevenue(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {
        return paymentService.calculateTotalRevenue(startDate, endDate);
    }

    @GetMapping("/revenue/by-method")
    public String getRevenueByMethod(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {
        return paymentService.getRevenueByPaymentMethod(startDate, endDate);
    }
}
