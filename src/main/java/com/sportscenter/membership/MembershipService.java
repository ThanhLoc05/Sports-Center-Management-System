package com.sportscenter.membership;

import com.sportscenter.common.service.DomainServiceSupport;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class MembershipService extends DomainServiceSupport {
    public MembershipService(JdbcTemplate jdbc) { super(jdbc); }

    private static final Set<String> PAYMENT_METHODS = Set.of("CASH", "BANK_TRANSFER", "CARD");

    public List<Map<String, Object>> memberships(boolean activeOnly) {
        return jdbc.queryForList("""
                SELECT id, name, duration_days, price, description, is_active
                FROM dbo.memberships
                WHERE ? = 0 OR is_active = 1
                ORDER BY price
                """, activeOnly ? 1 : 0);
    }

    @Transactional
    public Map<String, Object> createMembership(String name, int durationDays, BigDecimal price, String description) {
        long id = jdbc.queryForObject("""
                INSERT INTO dbo.memberships (name, duration_days, price, description)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?)
                """, Long.class, name.trim(), durationDays, price, description);
        return membershipById(id);
    }

    public List<Map<String, Object>> memberMemberships(String email) {
        return jdbc.queryForList("""
                SELECT um.id, um.user_id, m.name AS membership_name, um.start_date, um.end_date, um.status,
                       i.id AS invoice_id, i.total_amount, i.payment_method
                FROM dbo.user_memberships um
                JOIN dbo.users u ON u.id = um.user_id
                JOIN dbo.memberships m ON m.id = um.membership_id
                LEFT JOIN dbo.invoices i ON i.user_membership_id = um.id
                WHERE u.email = ?
                ORDER BY um.start_date DESC, um.id DESC
                """, email);
    }

    @Transactional
    public Map<String, Object> subscribe(long memberId, long membershipId, String paymentMethod, String receptionistEmail) {
        String method = normalizeChoice(paymentMethod, PAYMENT_METHODS, "Phương thức thanh toán không hợp lệ.");
        requireMember(memberId);
        Map<String, Object> pack = membershipById(membershipId);
        if (!Boolean.TRUE.equals(pack.get("is_active"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Gói tập hiện không hoạt động.");
        }

        LocalDate today = LocalDate.now();
        LocalDate startDate = today;
        List<LocalDate> activeEndDates = jdbc.query("""
                SELECT end_date FROM dbo.user_memberships
                WHERE user_id = ? AND status = 'ACTIVE' AND end_date >= ?
                ORDER BY end_date DESC
                """, (rs, row) -> rs.getDate("end_date").toLocalDate(), memberId, today);
        if (!activeEndDates.isEmpty()) {
            startDate = activeEndDates.getFirst().plusDays(1);
        }
        LocalDate endDate = startDate.plusDays(((Number) pack.get("duration_days")).longValue() - 1);
        long userMembershipId = jdbc.queryForObject("""
                INSERT INTO dbo.user_memberships (user_id, membership_id, start_date, end_date, status)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, 'ACTIVE')
                """, Long.class, memberId, membershipId, startDate, endDate);
        Long receptionistId = receptionistEmail == null ? null : userId(receptionistEmail);
        long invoiceId = jdbc.queryForObject("""
                INSERT INTO dbo.invoices (user_id, receptionist_id, user_membership_id, total_amount, payment_method)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)
                """, Long.class, memberId, receptionistId, userMembershipId, pack.get("price"), method);
        return jdbc.queryForMap("""
                SELECT um.id AS user_membership_id, um.start_date, um.end_date, um.status,
                       i.id AS invoice_id, i.total_amount, i.payment_method
                FROM dbo.user_memberships um JOIN dbo.invoices i ON i.user_membership_id = um.id
                WHERE um.id = ? AND i.id = ?
                """, userMembershipId, invoiceId);
    }

    public List<Map<String, Object>> invoices(String email, boolean all) {
        String sql = """
                SELECT i.id, i.user_id, u.full_name AS member_name, i.receptionist_id,
                       r.full_name AS receptionist_name, i.user_membership_id, i.total_amount,
                       i.payment_method, i.created_at
                FROM dbo.invoices i
                JOIN dbo.users u ON u.id = i.user_id
                LEFT JOIN dbo.users r ON r.id = i.receptionist_id
                """ + (all ? " ORDER BY i.created_at DESC" : " WHERE u.email = ? ORDER BY i.created_at DESC");
        return all ? jdbc.queryForList(sql) : jdbc.queryForList(sql, email);
    }

    public Map<String, Object> revenueReport(LocalDate fromDate, LocalDate toDate) {
        if (fromDate == null || toDate == null || toDate.isBefore(fromDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cần cung cấp khoảng ngày hợp lệ.");
        }
        Map<String, Object> totals = jdbc.queryForMap("""
                SELECT COUNT(*) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_revenue
                FROM dbo.invoices
                WHERE created_at >= ? AND created_at < DATEADD(DAY, 1, ?)
                """, fromDate, toDate);
        List<Map<String, Object>> byPaymentMethod = jdbc.queryForList("""
                SELECT payment_method, COUNT(*) AS invoice_count, SUM(total_amount) AS total_revenue
                FROM dbo.invoices
                WHERE created_at >= ? AND created_at < DATEADD(DAY, 1, ?)
                GROUP BY payment_method ORDER BY payment_method
                """, fromDate, toDate);
        return Map.of("from", fromDate, "to", toDate, "summary", totals, "byPaymentMethod", byPaymentMethod);
    }

    private Map<String, Object> membershipById(long id) {
        List<Map<String, Object>> found = jdbc.queryForList("""
                SELECT id, name, duration_days, price, description, is_active
                FROM dbo.memberships WHERE id = ?
                """, id);
        if (found.isEmpty()) {
            throw notFound("Không tìm thấy gói tập.");
        }
        return found.getFirst();
    }
}
