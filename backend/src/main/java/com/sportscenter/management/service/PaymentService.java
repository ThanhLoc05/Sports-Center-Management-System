package com.sportscenter.management.service;

import com.sportscenter.management.dto.Response.RefundQuote;
import com.sportscenter.management.dto.Request.MemberRefundRequest;
import com.sportscenter.management.dto.Request.RefundRequest;

import com.sportscenter.management.dto.Request.InvoiceRequest;
import com.sportscenter.management.dto.Response.InvoiceResponse;
import com.sportscenter.management.dto.Response.RevenueSummaryResponse;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PaymentService {

    InvoiceResponse createInvoice(InvoiceRequest request);

    Optional<InvoiceResponse> getInvoiceById(Integer invoiceId);

    List<InvoiceResponse> getMemberInvoices(Integer memberId);

    InvoiceResponse markAsPaid(Integer invoiceId);

    List<InvoiceResponse> pendingRefundRequests();

    InvoiceResponse requestRefund(Integer invoiceId, MemberRefundRequest request);

    RefundQuote quoteRefund(Integer invoiceId);

    InvoiceResponse refundInvoice(Integer invoiceId, RefundRequest request);

    BigDecimal calculateTotalRevenue(LocalDateTime startDate, LocalDateTime endDate);

    List<InvoiceResponse> getPendingInvoices();

    String getRevenueByPaymentMethod(LocalDateTime startDate, LocalDateTime endDate);

    RevenueSummaryResponse getRevenueSummary(LocalDateTime startDate, LocalDateTime endDate);
}
