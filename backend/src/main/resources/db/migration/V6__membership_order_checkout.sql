/*
   Tao luong don dang ky/gia han cho den khi thu tien duoc xac nhan.
   Chay tren database hien co sau cac migration V3-V5. Khong xoa du lieu cu.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.membership_orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_orders (
        membership_order_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_orders PRIMARY KEY,
        member_id INT NOT NULL,
        package_id INT NOT NULL,
        order_kind NVARCHAR(20) NOT NULL,
        source_subscription_id INT NULL,
        source_package_id INT NULL,
        package_name_snapshot NVARCHAR(255) NOT NULL,
        package_price_snapshot DECIMAL(18,2) NOT NULL,
        package_duration_days_snapshot INT NOT NULL,
        package_status_snapshot NVARCHAR(20) NOT NULL,
        payment_method NVARCHAR(30) NOT NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_membership_orders_status DEFAULT N'PENDING_PAYMENT',
        idempotency_key NVARCHAR(100) NOT NULL,
        request_fingerprint CHAR(64) NOT NULL,
        created_by INT NOT NULL,
        confirmed_by INT NULL,
        bank_transaction_id NVARCHAR(100) NULL,
        confirmation_key NVARCHAR(100) NULL,
        confirmation_fingerprint CHAR(64) NULL,
        version INT NOT NULL CONSTRAINT DF_membership_orders_version DEFAULT (0),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_membership_orders_created_at DEFAULT SYSDATETIME(),
        confirmed_at DATETIME2 NULL,
        CONSTRAINT FK_membership_orders_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_membership_orders_packages FOREIGN KEY (package_id) REFERENCES dbo.membership_packages(package_id),
        CONSTRAINT FK_membership_orders_source_subscription FOREIGN KEY (source_subscription_id) REFERENCES dbo.member_subscriptions(subscription_id),
        CONSTRAINT FK_membership_orders_source_package FOREIGN KEY (source_package_id) REFERENCES dbo.membership_packages(package_id),
        CONSTRAINT FK_membership_orders_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_membership_orders_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_membership_orders_kind CHECK (order_kind IN (N'NEW', N'RENEWAL')),
        CONSTRAINT CK_membership_orders_method CHECK (payment_method IN (N'CASH', N'BANK_TRANSFER')),
        CONSTRAINT CK_membership_orders_status CHECK (status IN (N'PENDING_PAYMENT', N'CONFIRMED', N'CANCELLED')),
        CONSTRAINT CK_membership_orders_snapshot CHECK (package_price_snapshot > 0 AND package_duration_days_snapshot > 0 AND version >= 0),
        CONSTRAINT CK_membership_orders_source CHECK ((order_kind = N'NEW' AND source_subscription_id IS NULL AND source_package_id IS NULL) OR (order_kind = N'RENEWAL' AND source_subscription_id IS NOT NULL AND source_package_id IS NOT NULL)),
        CONSTRAINT UQ_membership_orders_creator_key UNIQUE (created_by, idempotency_key)
    );
END;

IF COL_LENGTH(N'dbo.invoices', N'membership_order_id') IS NULL
    ALTER TABLE dbo.invoices ADD membership_order_id INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoices_membership_orders')
    ALTER TABLE dbo.invoices ADD CONSTRAINT FK_invoices_membership_orders
        FOREIGN KEY (membership_order_id) REFERENCES dbo.membership_orders(membership_order_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'UX_invoices_membership_order')
    CREATE UNIQUE INDEX UX_invoices_membership_order ON dbo.invoices(membership_order_id)
        WHERE membership_order_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'UX_membership_orders_bank_transaction')
    CREATE UNIQUE INDEX UX_membership_orders_bank_transaction ON dbo.membership_orders(bank_transaction_id)
        WHERE bank_transaction_id IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'IX_membership_orders_member_status_created')
    CREATE INDEX IX_membership_orders_member_status_created
        ON dbo.membership_orders(member_id, status, created_at DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'UX_membership_orders_one_pending_per_member')
    CREATE UNIQUE INDEX UX_membership_orders_one_pending_per_member
        ON dbo.membership_orders(member_id) WHERE status = N'PENDING_PAYMENT';

COMMIT TRANSACTION;
