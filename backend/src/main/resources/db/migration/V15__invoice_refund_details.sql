-- Bổ sung chứng từ cho lượt hoàn mới, giữ nguyên hóa đơn lịch sử.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.invoices', N'refunded_amount') IS NULL
        ALTER TABLE dbo.invoices ADD refunded_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_reason') IS NULL
        ALTER TABLE dbo.invoices ADD refund_reason NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_method') IS NULL
        ALTER TABLE dbo.invoices ADD refund_method VARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_reference') IS NULL
        ALTER TABLE dbo.invoices ADD refund_reference NVARCHAR(120) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refunded_by') IS NULL
        ALTER TABLE dbo.invoices ADD refunded_by INT NULL;
COMMIT TRANSACTION;
