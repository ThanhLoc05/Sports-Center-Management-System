/*
  Temporary data for public member signup. A row is promoted to dbo.users only after OTP verification.
  Run once after V12 on the intended database; do not use Hibernate ddl-auto=update.
*/
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.pending_member_registrations', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.pending_member_registrations (
            registration_id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_pending_member_registrations PRIMARY KEY,
            email NVARCHAR(255) NOT NULL,
            password_hash NVARCHAR(255) NOT NULL,
            full_name NVARCHAR(100) NOT NULL,
            phone NVARCHAR(20) NOT NULL,
            otp_hash NVARCHAR(100) NOT NULL,
            created_at DATETIME2 NOT NULL,
            expires_at DATETIME2 NOT NULL,
            last_sent_at DATETIME2 NOT NULL,
            resend_window_started_at DATETIME2 NOT NULL,
            attempt_count INT NOT NULL CONSTRAINT DF_pending_member_registrations_attempt DEFAULT 0,
            resend_count INT NOT NULL CONSTRAINT DF_pending_member_registrations_resend DEFAULT 0,
            CONSTRAINT UQ_pending_member_registrations_email UNIQUE (email),
            CONSTRAINT CK_pending_member_registrations_attempt CHECK (attempt_count BETWEEN 0 AND 5),
            CONSTRAINT CK_pending_member_registrations_resend CHECK (resend_count BETWEEN 0 AND 5)
        );

        CREATE INDEX IX_pending_member_registrations_expiry
            ON dbo.pending_member_registrations(expires_at);
        CREATE INDEX IX_pending_member_registrations_phone
            ON dbo.pending_member_registrations(phone, expires_at);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
