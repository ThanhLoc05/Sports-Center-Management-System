package com.sportscenter.common.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public abstract class DomainServiceSupport {
    protected final JdbcTemplate jdbc;

    protected DomainServiceSupport(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    protected long userId(String email) {
        List<Long> ids = jdbc.query("SELECT id FROM dbo.users WHERE email = ?",
                (rs, row) -> rs.getLong(1), email.toLowerCase(Locale.ROOT));
        if (ids.isEmpty()) throw notFound("Không tìm thấy tài khoản.");
        return ids.getFirst();
    }

    protected void requireMember(long userId) { requireRole(userId, "MEMBER"); }

    protected void requireRole(long userId, String role) {
        if (!exists("SELECT COUNT(*) FROM dbo.users WHERE id = ? AND role = ? AND status = 'ACTIVE'", userId, role)) {
            throw notFound("Không tìm thấy tài khoản có vai trò phù hợp.");
        }
    }

    protected boolean exists(String sql, Object... args) {
        Integer count = jdbc.queryForObject(sql, Integer.class, args);
        return count != null && count > 0;
    }

    protected String normalizeChoice(String input, Set<String> choices, String error) {
        String choice = input == null ? "" : input.trim().toUpperCase(Locale.ROOT);
        if (!choices.contains(choice)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error);
        return choice;
    }

    protected ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
