SET XACT_ABORT ON;
BEGIN TRANSACTION;
    IF COL_LENGTH(N'dbo.invoices', N'refund_requested_at') IS NULL
        ALTER TABLE dbo.invoices ADD refund_requested_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_request_reason') IS NULL
        ALTER TABLE dbo.invoices ADD refund_request_reason NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_requested_amount') IS NULL
        ALTER TABLE dbo.invoices ADD refund_requested_amount DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refund_requested_percent') IS NULL
        ALTER TABLE dbo.invoices ADD refund_requested_percent INT NULL;
COMMIT TRANSACTION;
