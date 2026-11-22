package com.sportscenter.management.dto.Response;

import java.math.BigDecimal;
import java.time.LocalDate;

public record RefundQuote(LocalDate registeredOn, LocalDate lastRefundDate, int percent, BigDecimal amount) {}
