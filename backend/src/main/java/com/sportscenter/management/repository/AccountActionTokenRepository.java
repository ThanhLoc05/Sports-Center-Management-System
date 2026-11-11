package com.sportscenter.management.repository;

import com.sportscenter.management.entity.AccountActionToken;
import com.sportscenter.management.entity.AccountActionToken.Purpose;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AccountActionTokenRepository
        extends JpaRepository<AccountActionToken, Long> {
    // Row lock makes token consumption single-use under concurrent requests.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        select t from AccountActionToken t
        where t.tokenHash = :hash and t.purpose = :purpose and t.usedAt is null
        """)
    Optional<AccountActionToken> findUsableForUpdate(
            @Param("hash") String hash,
            @Param("purpose") Purpose purpose);

    List<AccountActionToken> findByUserIdAndPurposeAndUsedAtIsNull(
            Integer userId, Purpose purpose);

    long countByUserIdAndPurposeAndCreatedAtAfter(
            Integer userId, Purpose purpose, LocalDateTime after);
}
