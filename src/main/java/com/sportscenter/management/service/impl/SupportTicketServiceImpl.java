package com.sportscenter.management.service.impl;

import com.sportscenter.auth.SecurityUtils;
import com.sportscenter.management.dto.Request.SupportTicketRequest;
import com.sportscenter.management.dto.Response.SupportTicketResponse;
import com.sportscenter.management.entity.SupportTicket;
import com.sportscenter.management.repository.SupportTicketRepository;
import com.sportscenter.management.repository.UserRepository;
import com.sportscenter.management.service.SupportTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class SupportTicketServiceImpl implements SupportTicketService {

    private final SupportTicketRepository ticketRepository;
    private final UserRepository userRepository;
    private final SecurityUtils securityUtils;

    @Override
    public SupportTicketResponse createTicket(SupportTicketRequest request, Integer memberId) {
        if (request == null) {
            throw new IllegalArgumentException("Thông tin phiếu hỗ trợ không được để trống");
        }

        if (memberId == null) {
            memberId = securityUtils.getCurrentUserId();
        }

        if (memberId == null || !userRepository.existsById(memberId)) {
            throw new IllegalArgumentException("Học viên không hợp lệ hoặc chưa đăng nhập");
        }

        SupportTicket ticket = SupportTicket.builder()
                .memberId(memberId)
                .subject(request.getSubject())
                .content(request.getContent())
                .status("OPEN")
                .createdAt(LocalDateTime.now())
                .build();

        SupportTicket saved = ticketRepository.save(ticket);
        return mapToResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SupportTicketResponse> getAllTickets(String status) {
        List<SupportTicket> list;
        if (status != null && !status.isBlank()) {
            list = ticketRepository.findByStatus(status.toUpperCase().trim());
        } else {
            list = ticketRepository.findAll();
        }
        return list.stream().map(this::mapToResponse).collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SupportTicketResponse> getTicketsByMemberId(Integer memberId) {
        return ticketRepository.findByMemberId(memberId).stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SupportTicketResponse> getTicketById(Integer id) {
        return ticketRepository.findById(id).map(this::mapToResponse);
    }

    @Override
    public SupportTicketResponse resolveTicket(Integer id, String response, Integer resolvedBy) {
        SupportTicket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Phiếu hỗ trợ không tồn tại"));

        if (!"OPEN".equals(ticket.getStatus())) {
            throw new IllegalArgumentException("Chỉ phiếu đang mở (OPEN) mới có thể xử lý và phản hồi");
        }

        if (resolvedBy == null) {
            resolvedBy = securityUtils.getCurrentUserId();
        }

        ticket.setStatus("RESOLVED");
        ticket.setResponse(response);
        ticket.setResolvedBy(resolvedBy);
        ticket.setResolvedAt(LocalDateTime.now());

        SupportTicket saved = ticketRepository.save(ticket);
        return mapToResponse(saved);
    }

    private SupportTicketResponse mapToResponse(SupportTicket ticket) {
        return SupportTicketResponse.builder()
                .id(ticket.getId())
                .memberId(ticket.getMemberId())
                .subject(ticket.getSubject())
                .content(ticket.getContent())
                .status(ticket.getStatus())
                .response(ticket.getResponse())
                .resolvedBy(ticket.getResolvedBy())
                .createdAt(ticket.getCreatedAt())
                .resolvedAt(ticket.getResolvedAt())
                .build();
    }
}
