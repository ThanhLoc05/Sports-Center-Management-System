package com.sportscenter.management.controller;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.SupportTicketRequest;
import com.sportscenter.management.dto.Request.SupportTicketResolveRequest;
import com.sportscenter.management.dto.Response.SupportTicketResponse;
import com.sportscenter.management.service.SupportTicketService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * ============================================================================
 * CONTROLLER HỖ TRỢ THÀNH VIÊN (SUPPORT TICKET CONTROLLER)
 * ============================================================================
 * Phân quyền & Nghiệp vụ:
 * 1. Học viên gửi phiếu yêu cầu hỗ trợ / khiếu nại (POST /api/v1/support-tickets).
 * 2. Lễ tân (RECEPTIONIST) & Quản lý trung tâm (CENTER_MANAGER) tiếp nhận xử lý tại quầy (GET & PATCH resolve).
 * 3. Học viên xem lịch sử và trạng thái phản hồi của các phiếu mình đã gửi (GET /my).
 */
@RestController
@RequestMapping("/api/v1/support-tickets")
@RequiredArgsConstructor
public class SupportTicketController {

    private final SupportTicketService supportTicketService;
    private final SecurityUtils securityUtils;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SupportTicketResponse> createTicket(
            @Valid @RequestBody SupportTicketRequest request,
            @RequestParam(required = false) Integer memberId) {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        Integer targetMemberId = memberId != null && (securityUtils.isReceptionist() || securityUtils.isCenterManager())
                ? memberId
                : currentUserId;

        return ResponseEntity.status(201).body(supportTicketService.createTicket(request, targetMemberId));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<List<SupportTicketResponse>> getAllTickets(
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(supportTicketService.getAllTickets(status));
    }

    @GetMapping("/my")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<SupportTicketResponse>> getMyTickets() {
        Integer currentUserId = securityUtils.getCurrentUserId();
        if (currentUserId == null) return ResponseEntity.status(401).build();

        return ResponseEntity.ok(supportTicketService.getTicketsByMemberId(currentUserId));
    }

    @GetMapping("/member/{memberId}")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<List<SupportTicketResponse>> getTicketsByMember(@PathVariable Integer memberId) {
        return ResponseEntity.ok(supportTicketService.getTicketsByMemberId(memberId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SupportTicketResponse> getTicketById(@PathVariable Integer id) {
        var ticket = supportTicketService.getTicketById(id);
        if (ticket.isEmpty()) return ResponseEntity.notFound().build();
        if (!securityUtils.isOwnerOrAuthorized(ticket.get().getMemberId())) {
            return ResponseEntity.status(403).build();
        }
        return ResponseEntity.ok(ticket.get());
    }

    @PatchMapping("/{id}/resolve")
    @PreAuthorize("hasAnyRole('RECEPTIONIST', 'CENTER_MANAGER')")
    public ResponseEntity<SupportTicketResponse> resolveTicket(
            @PathVariable Integer id,
            @Valid @RequestBody SupportTicketResolveRequest request) {
        Integer resolvedBy = securityUtils.getCurrentUserId();
        return ResponseEntity.ok(supportTicketService.resolveTicket(id, request.getResponse(), resolvedBy));
    }
}
