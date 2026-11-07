/*
  Persistent audit trail for successful authenticated business mutations.
  Run once on databases already migrated through V7.
*/
SET XACT_ABORT ON;
IF DB_NAME() IN (N'master', N'model', N'msdb', N'tempdb')
    THROW 51020, N'Hãy chọn database của dự án trước khi chạy migration V8.', 1;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.audit_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_logs (
        audit_log_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY,
        actor_id INT NOT NULL,
        action NVARCHAR(50) NOT NULL,
        entity_type NVARCHAR(100) NOT NULL,
        entity_id INT NULL,
        details NVARCHAR(1000) NULL,
        old_value NVARCHAR(MAX) NULL,
        new_value NVARCHAR(MAX) NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_audit_logs_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_audit_logs_users FOREIGN KEY (actor_id) REFERENCES dbo.users(user_id)
    );
END;

IF COL_LENGTH(N'dbo.audit_logs', N'details') IS NULL
    ALTER TABLE dbo.audit_logs ADD details NVARCHAR(1000) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.audit_logs') AND name = N'IX_audit_logs_created_at')
    CREATE INDEX IX_audit_logs_created_at ON dbo.audit_logs (created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.audit_logs') AND name = N'IX_audit_logs_actor_created')
    CREATE INDEX IX_audit_logs_actor_created ON dbo.audit_logs (actor_id, created_at DESC);

COMMIT TRANSACTION;
