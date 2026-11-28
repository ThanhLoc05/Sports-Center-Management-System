/* Apply on the verified database after V12. This migration only adds password-reset OTP storage. */
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.account_action_tokens', N'U') IS NULL
    THROW 51000, N'Áp dụng V12 trước V28 trên đúng database dự án.', 1;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.password_reset_otps', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.password_reset_otps (
            email NVARCHAR(255) NOT NULL CONSTRAINT PK_password_reset_otps PRIMARY KEY,
            user_id INT NOT NULL CONSTRAINT FK_password_reset_otps_user REFERENCES dbo.users(user_id),
            otp_hash NVARCHAR(100) NOT NULL,
            expires_at DATETIME2 NOT NULL,
            last_sent_at DATETIME2 NOT NULL,
            resend_window_started_at DATETIME2 NOT NULL,
            resend_count INT NOT NULL CONSTRAINT DF_password_reset_otps_resends DEFAULT 0,
            attempt_count INT NOT NULL CONSTRAINT DF_password_reset_otps_attempts DEFAULT 0,
            used_at DATETIME2 NULL,
            CONSTRAINT CK_password_reset_otps_resends CHECK (resend_count BETWEEN 0 AND 5),
            CONSTRAINT CK_password_reset_otps_attempts CHECK (attempt_count BETWEEN 0 AND 5)
        );
        CREATE INDEX IX_password_reset_otps_user ON dbo.password_reset_otps(user_id);
    END;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
