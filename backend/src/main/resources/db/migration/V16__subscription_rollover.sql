SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.member_subscriptions', N'rolled_into_id') IS NULL
    ALTER TABLE dbo.member_subscriptions ADD rolled_into_id INT NULL REFERENCES dbo.member_subscriptions(subscription_id);
IF COL_LENGTH(N'dbo.member_subscriptions', N'purchased_days') IS NULL
    ALTER TABLE dbo.member_subscriptions ADD purchased_days INT NULL;
COMMIT TRANSACTION;
