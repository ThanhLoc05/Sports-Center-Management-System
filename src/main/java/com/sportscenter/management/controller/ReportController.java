package com.sportscenter.management.controller;

import com.sportscenter.management.service.PaymentService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final PaymentService paymentService;

    public ReportController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping("/revenue")
    @PreAuthorize("hasRole('CENTER_MANAGER')") // Chỉ Center Manager mới có quyền xem báo cáo
    public ResponseEntity<BigDecimal> getRevenueReport(
            @RequestParam("startDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam("endDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {

        BigDecimal totalRevenue = paymentService.calculateTotalRevenue(startDate, endDate);
        return ResponseEntity.ok(totalRevenue);
    }
}
