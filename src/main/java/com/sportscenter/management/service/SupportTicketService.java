package com.sportscenter.management.service;

import com.sportscenter.management.dto.Request.SupportTicketRequest;
import com.sportscenter.management.dto.Response.SupportTicketResponse;

import java.util.List;
import java.util.Optional;

public interface SupportTicketService {

    SupportTicketResponse createTicket(SupportTicketRequest request, Integer memberId);

    List<SupportTicketResponse> getAllTickets(String status);

    List<SupportTicketResponse> getTicketsByMemberId(Integer memberId);

    Optional<SupportTicketResponse> getTicketById(Integer id);

    SupportTicketResponse resolveTicket(Integer id, String response, Integer resolvedBy);
}
