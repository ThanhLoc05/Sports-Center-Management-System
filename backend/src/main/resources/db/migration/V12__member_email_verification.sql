/*
  Xác minh email cho MEMBER tự đăng ký, đổi email có xác nhận, và reset mật khẩu.
  Hướng dẫn triển khai:
  1. Sao lưu database trước khi chạy trên môi trường dùng chung.
  2. Chạy đúng một lần trên database đã có V11.
  3. Tài khoản hiện hữu mặc định email_verified = 1 để không khóa đăng nhập.
  4. Không lưu Gmail App Password trong SQL; cấu hình bằng environment variables.
*/
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.users', N'email_verified') IS NULL
    BEGIN
        ALTER TABLE dbo.users
            ADD email_verified BIT NOT NULL
                CONSTRAINT DF_users_email_verified DEFAULT 1;
    END;

    -- Email đăng nhập cũ vẫn có hiệu lực cho tới khi email mới được xác nhận.
    IF COL_LENGTH(N'dbo.users', N'pending_email') IS NULL
    BEGIN
        ALTER TABLE dbo.users ADD pending_email NVARCHAR(255) NULL;
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UX_users_pending_email'
          AND object_id = OBJECT_ID(N'dbo.users')
    )
    BEGIN
        -- Mỗi email đang chờ chỉ được gắn với một tài khoản.
        -- Compile after ALTER TABLE has added the column in this transaction.
        EXEC(N'CREATE UNIQUE INDEX UX_users_pending_email
            ON dbo.users(pending_email)
            WHERE pending_email IS NOT NULL;');
    END;

    IF OBJECT_ID(N'dbo.account_action_tokens', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.account_action_tokens (
            token_id BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_account_action_tokens PRIMARY KEY,
            user_id INT NOT NULL,
            purpose NVARCHAR(30) NOT NULL,
            token_hash NVARCHAR(64) NOT NULL,
            -- Ràng buộc token với email để xác minh không bị chuyển sang địa chỉ khác.
            target_email NVARCHAR(255) NOT NULL,
            created_at DATETIME2 NOT NULL,
            expires_at DATETIME2 NOT NULL,
            used_at DATETIME2 NULL,
            CONSTRAINT UQ_account_action_tokens_hash UNIQUE (token_hash),
            CONSTRAINT FK_account_action_tokens_users
                FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
            CONSTRAINT CK_account_action_tokens_purpose
                CHECK (purpose IN (N'VERIFY_EMAIL', N'RESET_PASSWORD'))
        );

        CREATE INDEX IX_account_action_tokens_user_purpose_created
            ON dbo.account_action_tokens(user_id, purpose, created_at);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
