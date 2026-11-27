/* [GÓI COMBO] Chỉ bán 4 gói: STANDARD / VIP, combo 1 tháng (30 ngày) và 3 tháng (90 ngày).
   Giá giống nhau cho tiền mặt và chuyển khoản:
     STANDARD 1 tháng = 10.000 VND, STANDARD 3 tháng = 30.000 VND
     VIP 1 tháng      = 15.000 VND, VIP 3 tháng      = 35.000 VND
   Các gói khác chuyển sang INACTIVE (ngừng bán) chứ không xóa, để giữ lịch sử đơn/hóa đơn cũ.
   Chạy 1 lần trên database dự án; chạy lại vẫn an toàn. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NULL
    THROW 51000, N'Chọn đúng database dự án có bảng membership_packages.', 1;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 1 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, sport_limit, max_concurrent_classes, course_discount_percent, description, status)
    VALUES (N'Gói STANDARD 1 tháng', 30, 10000, N'STANDARD', 1, 1, 0, N'Gói tập tiêu chuẩn: 1 bộ môn đã chọn, lớp có HLV, theo dõi kết quả tập luyện.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, sport_limit, max_concurrent_classes, course_discount_percent, description, status)
    VALUES (N'Gói STANDARD 3 tháng', 90, 30000, N'STANDARD', 1, 1, 0, N'Gói tập tiêu chuẩn: 1 bộ môn đã chọn, lớp có HLV, theo dõi kết quả tập luyện.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 1 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, sport_limit, max_concurrent_classes, course_discount_percent, description, status)
    VALUES (N'Gói VIP 1 tháng', 30, 15000, N'VIP', NULL, 2, 10, N'Gói tập cao cấp: tất cả bộ môn, lớp có HLV, khăn tập và nước uống miễn phí.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, sport_limit, max_concurrent_classes, course_discount_percent, description, status)
    VALUES (N'Gói VIP 3 tháng', 90, 35000, N'VIP', NULL, 2, 10, N'Gói tập cao cấp: tất cả bộ môn, lớp có HLV, khăn tập và nước uống miễn phí.', N'ACTIVE');

UPDATE dbo.membership_packages
SET price = CASE package_name
        WHEN N'Gói STANDARD 1 tháng' THEN 10000
        WHEN N'Gói STANDARD 3 tháng' THEN 30000
        WHEN N'Gói VIP 1 tháng' THEN 15000
        WHEN N'Gói VIP 3 tháng' THEN 35000
    END,
    duration_days = CASE WHEN package_name LIKE N'% 3 tháng' THEN 90 ELSE 30 END,
    access_level = CASE WHEN package_name LIKE N'Gói VIP %' THEN N'VIP' ELSE N'STANDARD' END,
    status = N'ACTIVE'
WHERE package_name IN (N'Gói STANDARD 1 tháng', N'Gói STANDARD 3 tháng', N'Gói VIP 1 tháng', N'Gói VIP 3 tháng');

/* Ngừng bán mọi gói khác (Gói tháng/quý/năm, gói 6 tháng...). Gói thành viên đang dùng vẫn giữ nguyên hạn. */
UPDATE dbo.membership_packages
SET status = N'INACTIVE'
WHERE status = N'ACTIVE'
  AND package_name NOT IN (N'Gói STANDARD 1 tháng', N'Gói STANDARD 3 tháng', N'Gói VIP 1 tháng', N'Gói VIP 3 tháng');

COMMIT TRANSACTION;
