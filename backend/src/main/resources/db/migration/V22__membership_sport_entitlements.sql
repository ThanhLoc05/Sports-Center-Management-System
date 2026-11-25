SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.membership_orders', 'selected_sport_id') IS NULL
    ALTER TABLE dbo.membership_orders ADD selected_sport_id INT NULL
        CONSTRAINT FK_membership_orders_selected_sport REFERENCES dbo.sports(sport_id);

IF COL_LENGTH('dbo.member_subscriptions', 'selected_sport_id') IS NULL
    ALTER TABLE dbo.member_subscriptions ADD selected_sport_id INT NULL
        CONSTRAINT FK_member_subscriptions_selected_sport REFERENCES dbo.sports(sport_id);

IF COL_LENGTH('dbo.membership_orders', 'entitlement_level') IS NULL
    ALTER TABLE dbo.membership_orders ADD entitlement_level NVARCHAR(30) NULL
        CONSTRAINT CK_membership_orders_entitlement_level CHECK (entitlement_level IN (N'STANDARD', N'VIP'));

IF COL_LENGTH('dbo.member_subscriptions', 'entitlement_level') IS NULL
    ALTER TABLE dbo.member_subscriptions ADD entitlement_level NVARCHAR(30) NULL
        CONSTRAINT CK_member_subscriptions_entitlement_level CHECK (entitlement_level IN (N'STANDARD', N'VIP'));


-- V19 could already have recorded a sport on regular-class enrollment.
-- Preserve explicit choices from the old Flexible Booking schema.
GO
IF EXISTS (
    SELECT s.subscription_id
    FROM dbo.member_subscriptions s
    JOIN dbo.membership_packages p ON p.package_id = s.package_id
    JOIN dbo.membership_sports chosen ON chosen.subscription_id = s.subscription_id
    WHERE s.selected_sport_id IS NULL AND s.status = N'ACTIVE'
      AND COALESCE(s.entitlement_level, p.access_level) = N'STANDARD'
    GROUP BY s.subscription_id
    HAVING COUNT(*) > 1
)
    THROW 51022, N'Có kỳ STANDARD đang hoạt động với nhiều môn đã chọn. Cần đối chiếu trước khi nâng cấp.', 1;

WITH single_sport AS (
    SELECT subscription_id, MIN(sport_id) AS sport_id
    FROM dbo.membership_sports
    GROUP BY subscription_id
    HAVING COUNT(*) = 1
)
UPDATE s
SET selected_sport_id = chosen.sport_id
FROM dbo.member_subscriptions s
JOIN dbo.membership_packages p ON p.package_id = s.package_id
JOIN single_sport chosen ON chosen.subscription_id = s.subscription_id
WHERE s.selected_sport_id IS NULL
  AND COALESCE(s.entitlement_level, p.access_level) = N'STANDARD';

COMMIT TRANSACTION;
