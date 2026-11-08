SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.membership_orders', N'U') IS NOT NULL
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name = N'CK_membership_orders_status'
          AND parent_object_id = OBJECT_ID(N'dbo.membership_orders')
    )
        ALTER TABLE dbo.membership_orders DROP CONSTRAINT CK_membership_orders_status;

    UPDATE order_row
    SET status = N'REFUNDED'
    FROM dbo.membership_orders AS order_row
    INNER JOIN dbo.invoices AS invoice
        ON invoice.membership_order_id = order_row.membership_order_id
    WHERE invoice.payment_status = N'REFUNDED'
      AND order_row.status <> N'REFUNDED';

    ALTER TABLE dbo.membership_orders
        ADD CONSTRAINT CK_membership_orders_status
        CHECK (status IN (N'PENDING_PAYMENT', N'CONFIRMED', N'CANCELLED', N'REFUNDED'));
END;

COMMIT TRANSACTION;
