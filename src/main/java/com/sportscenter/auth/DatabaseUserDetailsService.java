package com.sportscenter.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
public class DatabaseUserDetailsService implements UserDetailsService {
    private final JdbcTemplate jdbc;

    public DatabaseUserDetailsService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return jdbc.query("""
                SELECT email, password_hash, role, status
                FROM dbo.users
                WHERE email = ?
                """, rs -> {
            if (!rs.next()) {
                throw new UsernameNotFoundException("Không tìm thấy tài khoản.");
            }
            return User.withUsername(rs.getString("email"))
                    .password(rs.getString("password_hash"))
                    .roles(rs.getString("role"))
                    .disabled(!"ACTIVE".equalsIgnoreCase(rs.getString("status")))
                    .build();
        }, email.toLowerCase(Locale.ROOT));
    }
}
