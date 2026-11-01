package com.sportscenter.management.repository;

import com.sportscenter.management.entity.SupportTicket;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SupportTicketRepository extends JpaRepository<SupportTicket, Integer> {
    List<SupportTicket> findByMemberId(Integer memberId);
    List<SupportTicket> findByStatus(String status);
}
