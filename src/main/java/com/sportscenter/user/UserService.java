package com.sportscenter.user;

import com.sportscenter.common.service.DomainServiceSupport;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class UserService extends DomainServiceSupport {
    private static final Set<String> ROLES = Set.of("MANAGER", "COACH", "RECEPTIONIST", "MEMBER");
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    public UserService(JdbcTemplate jdbc, org.springframework.security.crypto.password.PasswordEncoder passwordEncoder) {
        super(jdbc);
        this.passwordEncoder = passwordEncoder;
    }


    @Transactional
    public Map<String, Object> registerMember(String email, String password, String fullName, String phone,
                                               LocalDate dateOfBirth, String gender, String address,
                                               String fitnessGoal, String emergencyContact) {
        long memberId = insertUser(email, password, fullName, phone, "MEMBER");
        jdbc.update("""
                INSERT INTO dbo.member_profiles (user_id, date_of_birth, gender, address, fitness_goal, emergency_contact)
                VALUES (?, ?, ?, ?, ?, ?)
                """, memberId, dateOfBirth, gender, address, fitnessGoal, emergencyContact);
        return userById(memberId);
    }

    @Transactional
    public Map<String, Object> createStaff(String email, String password, String fullName, String phone, String role) {
        String normalizedRole = normalizeChoice(role, ROLES, "Vai trò không hợp lệ.");
        long userId = insertUser(email, password, fullName, phone, normalizedRole);
        if ("MEMBER".equals(normalizedRole)) {
            jdbc.update("INSERT INTO dbo.member_profiles (user_id) VALUES (?)", userId);
        }
        return userById(userId);
    }

    public List<Map<String, Object>> findMembers(String search) {
        String term = search == null ? "" : search.trim();
        return jdbc.queryForList("""
                SELECT u.id, u.email, u.full_name, u.phone, u.status, u.created_at,
                       p.date_of_birth, p.gender, p.address, p.fitness_goal, p.emergency_contact
                FROM dbo.users u
                LEFT JOIN dbo.member_profiles p ON p.user_id = u.id
                WHERE u.role = 'MEMBER'
                  AND (? = '' OR u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
                ORDER BY u.full_name
                """, term, "%" + term + "%", "%" + term + "%", "%" + term + "%");
    }

    public List<Map<String, Object>> findUsers(String search, String role) {
        String term = search == null ? "" : search.trim();
        String normalizedRole = role == null || role.isBlank() ? "" :
                normalizeChoice(role, ROLES, "Vai trò không hợp lệ.");
        return jdbc.queryForList("""
                SELECT u.id, u.email, u.full_name, u.phone, u.role, u.status, u.created_at,
                       p.fitness_goal
                FROM dbo.users u
                LEFT JOIN dbo.member_profiles p ON p.user_id = u.id
                WHERE (? = '' OR u.role = ?)
                  AND (? = '' OR u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
                ORDER BY u.role, u.full_name
                """, normalizedRole, normalizedRole, term, "%" + term + "%", "%" + term + "%", "%" + term + "%");
    }

    @Transactional
    public Map<String, Object> updateUserStatus(long userId, String status, String actorEmail) {
        String normalizedStatus = normalizeChoice(status, Set.of("ACTIVE", "INACTIVE"), "Trạng thái tài khoản không hợp lệ.");
        if (userId(actorEmail) == userId) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Không thể tự vô hiệu hóa tài khoản đang sử dụng.");
        }
        int updated = jdbc.update("UPDATE dbo.users SET status = ? WHERE id = ?", normalizedStatus, userId);
        if (updated == 0) {
            throw notFound("Không tìm thấy tài khoản.");
        }
        return userById(userId);
    }

    public Map<String, Object> currentUser(String email) {
        return jdbc.query("""
                SELECT id, email, full_name, phone, role, status, created_at
                FROM dbo.users WHERE email = ?
                """, rs -> {
            if (!rs.next()) {
                throw notFound("Không tìm thấy tài khoản.");
            }
            return Map.of(
                    "id", rs.getLong("id"),
                    "email", rs.getString("email"),
                    "fullName", rs.getString("full_name"),
                    "phone", rs.getString("phone") == null ? "" : rs.getString("phone"),
                    "role", rs.getString("role"),
                    "status", rs.getString("status"),
                    "createdAt", rs.getTimestamp("created_at").toInstant().toString());
        }, email);
    }

    public long memberId(String email) {
        return userId(email);
    }

    public Map<String, Object> memberProfile(String email) {
        List<Map<String, Object>> profiles = jdbc.queryForList("""
                SELECT u.id AS user_id, u.full_name, u.email, u.phone, p.date_of_birth, p.gender,
                       p.address, p.fitness_goal, p.emergency_contact
                FROM dbo.users u
                JOIN dbo.member_profiles p ON p.user_id = u.id
                WHERE u.email = ? AND u.role = 'MEMBER'
                """, email);
        if (profiles.isEmpty()) {
            throw notFound("Không tìm thấy hồ sơ thành viên.");
        }
        return profiles.getFirst();
    }

    @Transactional
    public Map<String, Object> updateMemberProfile(long memberId, LocalDate dateOfBirth, String gender,
                                                    String address, String fitnessGoal, String emergencyContact) {
        requireMember(memberId);
        if (exists("SELECT COUNT(*) FROM dbo.member_profiles WHERE user_id = ?", memberId)) {
            jdbc.update("""
                    UPDATE dbo.member_profiles
                    SET date_of_birth = ?, gender = ?, address = ?, fitness_goal = ?, emergency_contact = ?
                    WHERE user_id = ?
                    """, dateOfBirth, gender, address, fitnessGoal, emergencyContact, memberId);
        } else {
            jdbc.update("""
                    INSERT INTO dbo.member_profiles
                        (user_id, date_of_birth, gender, address, fitness_goal, emergency_contact)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, memberId, dateOfBirth, gender, address, fitnessGoal, emergencyContact);
        }
        return jdbc.queryForMap("""
                SELECT user_id, date_of_birth, gender, address, fitness_goal, emergency_contact
                FROM dbo.member_profiles WHERE user_id = ?
                """, memberId);
    }

    private long insertUser(String email, String password, String fullName, String phone, String role) {
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);
        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu không được vượt quá 72 byte UTF-8.");
        }
        if (exists("SELECT COUNT(*) FROM dbo.users WHERE email = ?", normalizedEmail)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email đã được sử dụng.");
        }
        return jdbc.queryForObject("""
                INSERT INTO dbo.users (email, password_hash, full_name, phone, role)
                OUTPUT INSERTED.id VALUES (?, ?, ?, ?, ?)
                """, Long.class, normalizedEmail, passwordEncoder.encode(password), fullName.trim(), phone, role);
    }

    private Map<String, Object> userById(long id) {
        return jdbc.queryForMap("""
                SELECT id, email, full_name, phone, role, status, created_at
                FROM dbo.users WHERE id = ?
                """, id);
    }
}
