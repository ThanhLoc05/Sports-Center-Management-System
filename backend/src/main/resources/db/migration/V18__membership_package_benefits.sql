/* Apply once to the selected project database before starting this backend.
   Re-running preserves benefit settings and purchase snapshots already saved. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NULL
    OR OBJECT_ID(N'dbo.membership_orders', N'U') IS NULL
    THROW 51000, N'Chọn đúng database dự án có membership_packages và membership_orders.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH(N'dbo.membership_packages', N'sport_limit') IS NULL
    ALTER TABLE dbo.membership_packages ADD sport_limit INT NULL;
IF COL_LENGTH(N'dbo.membership_packages', N'max_concurrent_classes') IS NULL
    ALTER TABLE dbo.membership_packages ADD max_concurrent_classes INT NULL;
IF COL_LENGTH(N'dbo.membership_packages', N'course_discount_percent') IS NULL
    ALTER TABLE dbo.membership_packages ADD course_discount_percent INT NULL;
IF COL_LENGTH(N'dbo.membership_orders', N'package_access_level_snapshot') IS NULL
    ALTER TABLE dbo.membership_orders ADD package_access_level_snapshot NVARCHAR(30) NULL;
IF COL_LENGTH(N'dbo.membership_orders', N'package_description_snapshot') IS NULL
    ALTER TABLE dbo.membership_orders ADD package_description_snapshot NVARCHAR(255) NULL;
IF COL_LENGTH(N'dbo.membership_orders', N'sport_limit_snapshot') IS NULL
    ALTER TABLE dbo.membership_orders ADD sport_limit_snapshot INT NULL;
IF COL_LENGTH(N'dbo.membership_orders', N'max_concurrent_classes_snapshot') IS NULL
    ALTER TABLE dbo.membership_orders ADD max_concurrent_classes_snapshot INT NULL;
IF COL_LENGTH(N'dbo.membership_orders', N'course_discount_percent_snapshot') IS NULL
    ALTER TABLE dbo.membership_orders ADD course_discount_percent_snapshot INT NULL;
GO

/* Existing rows have no benefit configuration yet. Do not overwrite later edits. */
UPDATE dbo.membership_packages
SET sport_limit = CASE WHEN access_level = N'VIP' THEN NULL ELSE 1 END,
    max_concurrent_classes = CASE WHEN access_level = N'VIP' THEN 2 ELSE 1 END,
    course_discount_percent = CASE WHEN access_level = N'VIP' THEN 10 ELSE 0 END
WHERE max_concurrent_classes IS NULL OR course_discount_percent IS NULL;

ALTER TABLE dbo.membership_packages ALTER COLUMN max_concurrent_classes INT NOT NULL;
ALTER TABLE dbo.membership_packages ALTER COLUMN course_discount_percent INT NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.membership_packages') AND name = N'DF_membership_packages_sport_limit')
    ALTER TABLE dbo.membership_packages ADD CONSTRAINT DF_membership_packages_sport_limit DEFAULT (1) FOR sport_limit;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.membership_packages') AND name = N'DF_membership_packages_max_classes')
    ALTER TABLE dbo.membership_packages ADD CONSTRAINT DF_membership_packages_max_classes DEFAULT (1) FOR max_concurrent_classes;
IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.membership_packages') AND name = N'DF_membership_packages_course_discount')
    ALTER TABLE dbo.membership_packages ADD CONSTRAINT DF_membership_packages_course_discount DEFAULT (0) FOR course_discount_percent;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID(N'dbo.membership_packages') AND name = N'CK_membership_packages_benefits')
    ALTER TABLE dbo.membership_packages WITH CHECK ADD CONSTRAINT CK_membership_packages_benefits
        CHECK ((sport_limit IS NULL OR sport_limit > 0) AND max_concurrent_classes > 0 AND course_discount_percent BETWEEN 0 AND 100);

/* Replace the old seed copy only; descriptions written by managers are preserved. */
UPDATE dbo.membership_packages
SET description = N'Duy trì tập luyện với các lớp STANDARD; xem lịch, thông tin HLV và theo dõi kết quả tập luyện.'
WHERE access_level = N'STANDARD' AND (description IS NULL OR LTRIM(RTRIM(description)) = N''
    OR description IN (N'Tập các lớp tiêu chuẩn trong 30 ngày.', N'Tập các lớp tiêu chuẩn trong 90 ngày.'));
UPDATE dbo.membership_packages
SET description = N'Tham gia lớp STANDARD và VIP, xem lịch, thông tin HLV và theo dõi kết quả tập luyện. Khăn tập và nước uống miễn phí khi tập tại trung tâm.'
WHERE access_level = N'VIP' AND (description IS NULL OR LTRIM(RTRIM(description)) = N''
    OR description IN (N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 30 ngày.', N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 90 ngày.'));

/* Old orders did not capture these fields. Establish their baseline once. */
UPDATE purchase
SET package_access_level_snapshot = pkg.access_level,
    package_description_snapshot = pkg.description,
    sport_limit_snapshot = pkg.sport_limit,
    max_concurrent_classes_snapshot = pkg.max_concurrent_classes,
    course_discount_percent_snapshot = pkg.course_discount_percent
FROM dbo.membership_orders AS purchase
JOIN dbo.membership_packages AS pkg ON pkg.package_id = purchase.package_id
WHERE purchase.package_access_level_snapshot IS NULL;
COMMIT TRANSACTION;
GO
