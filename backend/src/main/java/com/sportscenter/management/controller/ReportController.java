package com.sportscenter.management.controller;

import com.sportscenter.management.dto.Response.RevenueSummaryResponse;
import com.sportscenter.management.service.PaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/v1/reports")
@RequiredArgsConstructor
public class ReportController {

    private final PaymentService paymentService;

    @GetMapping("/revenue")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<BigDecimal> getRevenueReport(
            @RequestParam("startDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam("endDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {

        BigDecimal totalRevenue = paymentService.calculateTotalRevenue(startDate, endDate);
        return ResponseEntity.ok(totalRevenue);
    }

    @GetMapping("/summary")
    @PreAuthorize("hasRole('CENTER_MANAGER')")
    public ResponseEntity<RevenueSummaryResponse> getRevenueSummary(
            @RequestParam("startDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime startDate,
            @RequestParam("endDate") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime endDate) {

        RevenueSummaryResponse summary = paymentService.getRevenueSummary(startDate, endDate);
        return ResponseEntity.ok(summary);
    }
}
