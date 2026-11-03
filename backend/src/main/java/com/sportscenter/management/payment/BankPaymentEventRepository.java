package com.sportscenter.management.payment;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.util.Optional;

// TẠO MỚI: BankPaymentEventRepository — Tra cứu giao dịch trùng và tính tổng tiền đã nhận hợp lệ cho từng hóa đơn.
public interface BankPaymentEventRepository extends JpaRepository<BankPaymentEvent, Long> {
    Optional<BankPaymentEvent> findByProviderEventId(Long eventId);
    Optional<BankPaymentEvent> findFirstByInvoiceIdOrderByIdDesc(Integer invoiceId);
    /** Chỉ cộng các khoản đã kiểm tra đúng tài khoản/đơn, không cộng tiền chuyển sau khi đơn đã đóng. */
    @Query("select coalesce(sum(e.amount),0) from BankPaymentEvent e where e.invoiceId = :invoiceId and e.status in ('RECEIVED','APPLIED')")
    BigDecimal receivedTotal(Integer invoiceId);
}
