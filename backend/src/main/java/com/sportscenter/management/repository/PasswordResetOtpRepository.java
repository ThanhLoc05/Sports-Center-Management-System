package com.sportscenter.management.repository;

import com.sportscenter.management.entity.PasswordResetOtp;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface PasswordResetOtpRepository extends JpaRepository<PasswordResetOtp, String> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select otp from PasswordResetOtp otp where otp.email = :email")
    Optional<PasswordResetOtp> findByEmailForUpdate(@Param("email") String email);
}
