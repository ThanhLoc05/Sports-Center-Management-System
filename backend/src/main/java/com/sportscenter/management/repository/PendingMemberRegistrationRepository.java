package com.sportscenter.management.repository;

import com.sportscenter.management.entity.PendingMemberRegistration;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface PendingMemberRegistrationRepository
        extends JpaRepository<PendingMemberRegistration, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select registration from PendingMemberRegistration registration " +
            "where lower(registration.email) = lower(:email)")
    Optional<PendingMemberRegistration> findByEmailIgnoreCaseForUpdate(@Param("email") String email);

    boolean existsByPhoneAndEmailNotAndExpiresAtAfterAndLastSentAtAfter(
            String phone, String email, LocalDateTime expirationCutoff, LocalDateTime issueCutoff);

    long deleteByExpiresAtBefore(LocalDateTime expiresAt);
}
