/*
    Du lieu demo cho SportsCenterDB / SQL Server 2019.

    Dung sau khi chay schema.sql tren SportsCenterDB.
    Script co the chay lai: khong nhan doi tai khoan, goi, don, lop va giao dich da co.
    Ho ten va so dien thoai cac tai khoan seed duoc dong bo theo danh sach demo.

    Tai khoan demo hien co dung Sportiva@2026.
    Ba tai khoan member.demo/coach.demo/reception.demo dung password123.
    Mat khau duoc ma hoa BCrypt; chi dung cho database local/demo.

    Tao: 31 MEMBER, 4 COACH, 2 RECEPTIONIST, 1 CENTER_MANAGER,
    28 gói đã thanh toán (24 còn hạn), 2 order đang chờ, 19 buổi lớp,
    booking, attendance, membership/general notification history, feedback,
    support ticket, workout plan/log/details.

    Không seed payment_transactions thành công vì VNPay/MoMo/ZaloPay/PayOS
    đang tắt và dự án chưa tích hợp giao dịch gateway thật.
*/
USE [SportsCenterDB];
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

/* Đảm bảo các vai trò nền có đủ trước khi tạo tài khoản. */
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'MEMBER')
    INSERT INTO dbo.roles (role_name) VALUES (N'MEMBER');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'COACH')
    INSERT INTO dbo.roles (role_name) VALUES (N'COACH');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'RECEPTIONIST')
    INSERT INTO dbo.roles (role_name) VALUES (N'RECEPTIONIST');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'CENTER_MANAGER')
    INSERT INTO dbo.roles (role_name) VALUES (N'CENTER_MANAGER');

/* Bổ sung các danh mục nền nếu database được tạo trước khi seed danh mục. */
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Cầu lông')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Cầu lông', N'Lớp cầu lông theo trình độ');
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Bóng rổ')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Bóng rổ', N'Lớp bóng rổ cơ bản và nâng cao');
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Bơi lội')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Bơi lội', N'Lớp học bơi và rèn luyện kỹ thuật');
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Yoga')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Yoga', N'Lớp yoga cải thiện độ dẻo dai và thư giãn');
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Fitness')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Fitness', N'Lớp thể lực và rèn luyện sức mạnh');
IF NOT EXISTS (SELECT 1 FROM dbo.sports WHERE sport_name = N'Boxing')
    INSERT INTO dbo.sports (sport_name, description) VALUES (N'Boxing', N'Lớp boxing rèn luyện kỹ thuật và thể lực');

IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE room_name = N'Sân đa năng 1')
    INSERT INTO dbo.rooms (room_name, capacity) VALUES (N'Sân đa năng 1', 20);
IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE room_name = N'Sân đa năng 2')
    INSERT INTO dbo.rooms (room_name, capacity) VALUES (N'Sân đa năng 2', 20);
IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE room_name = N'Phòng tập nhóm')
    INSERT INTO dbo.rooms (room_name, capacity) VALUES (N'Phòng tập nhóm', 16);
IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE room_name = N'Hồ bơi')
    INSERT INTO dbo.rooms (room_name, capacity) VALUES (N'Hồ bơi', 12);

IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 1 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói STANDARD 1 tháng', 30, 500, N'STANDARD', N'Tập các lớp tiêu chuẩn trong 30 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói STANDARD 3 tháng', 90, 1350, N'STANDARD', N'Tập các lớp tiêu chuẩn trong 90 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 1 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói VIP 1 tháng', 30, 800, N'VIP', N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 30 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói VIP 3 tháng', 90, 2100, N'VIP', N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 90 ngày.', N'ACTIVE');

IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'VNPAY')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'VNPAY', N'VNPay', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'MOMO')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'MOMO', N'MoMo', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'ZALOPAY')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'ZALOPAY', N'ZaloPay', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'PAYOS')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'PAYOS', N'PayOS', 0);

DECLARE @DemoPasswordHash NVARCHAR(255) = N'$2a$10$QUa4z.6PjI2kh8cTzUrQZ.zSc/PE0BdWwVxoHRubh8U2akaptBUm6';
DECLARE @AdditionalDemoPasswordHash NVARCHAR(255) = N'$2a$10$sVIhAnludcT9T.T/GNxq0ep1LDFHaKEd9aFw71dwBANfxs5sRnjQW';
DECLARE @Today DATE = CONVERT(DATE, SYSDATETIME());

DECLARE @SeedAccounts TABLE (
    email NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(255) NOT NULL,
    phone NVARCHAR(255) NOT NULL,
    role_name NVARCHAR(255) NOT NULL
);
INSERT INTO @SeedAccounts (email, full_name, phone, role_name) VALUES
(N'manager.demo@sportiva.test', N'Nguyễn Minh Quân', N'0908124731', N'CENTER_MANAGER'),
(N'reception.demo@sportiva.test', N'Trần Thu Hà', N'0916347285', N'RECEPTIONIST'),
(N'coach1.demo@sportiva.test', N'Lê Hoàng Nam', N'0984271563', N'COACH'),
(N'coach2.demo@sportiva.test', N'Phạm Ngọc Mai', N'0935186247', N'COACH'),
(N'coach3.demo@sportiva.test', N'Võ Thành Long', N'0963418572', N'COACH'),
(N'member01.demo@sportiva.test', N'Nguyễn Gia Hân', N'0903847162', N'MEMBER'),
(N'member02.demo@sportiva.test', N'Trần Quốc Bảo', N'0917284653', N'MEMBER'),
(N'member03.demo@sportiva.test', N'Lê Ngọc Diệp', N'0936042817', N'MEMBER'),
(N'member04.demo@sportiva.test', N'Phạm Minh Khang', N'0948126735', N'MEMBER'),
(N'member05.demo@sportiva.test', N'Võ Thanh Vy', N'0965271943', N'MEMBER'),
(N'member06.demo@sportiva.test', N'Đặng Hoàng Phúc', N'0972638451', N'MEMBER'),
(N'member07.demo@sportiva.test', N'Bùi Thảo Nhi', N'0987153624', N'MEMBER'),
(N'member08.demo@sportiva.test', N'Đỗ Nhật Minh', N'0864319725', N'MEMBER'),
(N'member09.demo@sportiva.test', N'Hoàng Khánh Ly', N'0882576143', N'MEMBER'),
(N'member10.demo@sportiva.test', N'Phan Đức Anh', N'0896431752', N'MEMBER'),
(N'member11.demo@sportiva.test', N'Nguyễn Bảo Ngọc', N'0328174653', N'MEMBER'),
(N'member12.demo@sportiva.test', N'Phạm Quốc Hưng', N'0336429718', N'MEMBER'),
(N'member13.demo@sportiva.test', N'Trần Thảo Vy', N'0341758263', N'MEMBER'),
(N'member14.demo@sportiva.test', N'Lý Minh Đức', N'0358264179', N'MEMBER'),
(N'member15.demo@sportiva.test', N'Võ Ngọc Trâm', N'0362947185', N'MEMBER'),
(N'member16.demo@sportiva.test', N'Đặng Anh Tuấn', N'0375182634', N'MEMBER'),
(N'member17.demo@sportiva.test', N'Bùi Khánh My', N'0387214596', N'MEMBER'),
(N'member18.demo@sportiva.test', N'Hoàng Gia Huy', N'0394628175', N'MEMBER'),
(N'member19.demo@sportiva.test', N'Đỗ Thanh Hà', N'0568173942', N'MEMBER'),
(N'member20.demo@sportiva.test', N'Phan Nhật Nam', N'0582437619', N'MEMBER'),
(N'member21.demo@sportiva.test', N'Nguyễn Thùy Dương', N'0593716284', N'MEMBER'),
(N'member22.demo@sportiva.test', N'Trần Minh Khoa', N'0708263147', N'MEMBER'),
(N'member23.demo@sportiva.test', N'Lê Phương Thảo', N'0764158273', N'MEMBER'),
(N'member24.demo@sportiva.test', N'Vũ Anh Tú', N'0779384612', N'MEMBER'),
(N'member25.demo@sportiva.test', N'Đinh Ngọc Ánh', N'0786214739', N'MEMBER'),
(N'member26.demo@sportiva.test', N'Cao Thành Đạt', N'0793458126', N'MEMBER'),
(N'member27.demo@sportiva.test', N'Mai Hồng Nhung', N'0817263945', N'MEMBER'),
(N'member28.demo@sportiva.test', N'Hồ Đức Thịnh', N'0824936175', N'MEMBER'),
(N'member29.demo@sportiva.test', N'Dương Yến Nhi', N'0838172649', N'MEMBER'),
(N'member30.demo@sportiva.test', N'Tạ Hoàng Long', N'0842639517', N'MEMBER'),
(N'member.demo@sportiva.com', N'Trần Ngọc Mai', N'0857392164', N'MEMBER'),
(N'coach.demo@sportiva.com', N'Lê Hoàng Nam', N'0874612953', N'COACH'),
(N'reception.demo@sportiva.com', N'Phạm Thu Hà', N'0906274138', N'RECEPTIONIST');

INSERT INTO dbo.users (email, password_hash, full_name, phone, role_id, status)
SELECT seed.email,
       CASE
           WHEN seed.email IN (
               N'member.demo@sportiva.com',
               N'coach.demo@sportiva.com',
               N'reception.demo@sportiva.com'
           ) THEN @AdditionalDemoPasswordHash
           ELSE @DemoPasswordHash
       END,
       seed.full_name, seed.phone, role.role_id, N'ACTIVE'
FROM @SeedAccounts AS seed
JOIN dbo.roles AS role ON role.role_name = seed.role_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.users AS existing WHERE existing.email = seed.email);

/* Dữ liệu liên hệ của seed là giả lập, theo dạng số di động nội địa Việt Nam. */
IF EXISTS (
    SELECT 1
    FROM @SeedAccounts AS seed
    JOIN dbo.users AS other_user ON other_user.phone = seed.phone AND other_user.email <> seed.email
)
    THROW 50002, N'So dien thoai seed bi trung voi tai khoan khac. Dung script va chon lai so demo.', 1;

/* Đồng bộ họ tên và số điện thoại cho tài khoản seed đã tồn tại. */
UPDATE existing
SET full_name = seed.full_name,
    phone = seed.phone
FROM dbo.users AS existing
JOIN @SeedAccounts AS seed ON seed.email = existing.email
JOIN dbo.roles AS existing_role ON existing_role.role_id = existing.role_id AND existing_role.role_name = seed.role_name;

DECLARE @Accounts TABLE (email NVARCHAR(255) PRIMARY KEY, user_id INT NOT NULL, role_name NVARCHAR(255) NOT NULL);
INSERT INTO @Accounts (email, user_id, role_name)
SELECT seed.email, u.user_id, seed.role_name
FROM @SeedAccounts AS seed
JOIN dbo.users AS u ON u.email = seed.email;

/* Hồ sơ riêng cho các hội viên demo. */
INSERT INTO dbo.member_profiles (member_id, dob, gender, address, fitness_goals)
SELECT a.user_id, profile.dob, profile.gender, profile.address, profile.goal
FROM (VALUES
    (N'member01.demo@sportiva.test', CONVERT(DATE,'1998-04-12'), N'Nam', N'Quận 1, TP. Hồ Chí Minh', N'Tăng sức bền và cải thiện thể lực'),
    (N'member02.demo@sportiva.test', CONVERT(DATE,'1995-09-03'), N'Nam', N'Quận 3, TP. Hồ Chí Minh', N'Tăng cơ và duy trì cân nặng'),
    (N'member03.demo@sportiva.test', CONVERT(DATE,'2000-01-25'), N'Nữ', N'Quận Bình Thạnh, TP. Hồ Chí Minh', N'Cải thiện độ dẻo dai và thư giãn'),
    (N'member04.demo@sportiva.test', CONVERT(DATE,'1997-06-18'), N'Nam', N'Thành phố Thủ Đức, TP. Hồ Chí Minh', N'Tập sức mạnh và kỹ thuật boxing'),
    (N'member05.demo@sportiva.test', CONVERT(DATE,'2001-11-09'), N'Nữ', N'Quận 7, TP. Hồ Chí Minh', N'Duy trì vóc dáng và sức khỏe'),
    (N'member06.demo@sportiva.test', CONVERT(DATE,'1994-02-14'), N'Nam', N'Quận Tân Bình, TP. Hồ Chí Minh', N'Cải thiện kỹ thuật bơi'),
    (N'member07.demo@sportiva.test', CONVERT(DATE,'1999-08-20'), N'Nữ', N'Quận Phú Nhuận, TP. Hồ Chí Minh', N'Tăng sức bền'),
    (N'member08.demo@sportiva.test', CONVERT(DATE,'1996-12-02'), N'Nữ', N'Quận Gò Vấp, TP. Hồ Chí Minh', N'Tập luyện toàn thân'),
    (N'member09.demo@sportiva.test', CONVERT(DATE,'2002-03-30'), N'Nam', N'Quận 10, TP. Hồ Chí Minh', N'Làm quen với bóng rổ'),
    (N'member10.demo@sportiva.test', CONVERT(DATE,'1993-07-07'), N'Nữ', N'Quận 5, TP. Hồ Chí Minh', N'Tập luyện đều đặn và giảm căng thẳng'),
    (N'member11.demo@sportiva.test', CONVERT(DATE,'1999-05-16'), N'Nữ', N'Quận 4, TP. Hồ Chí Minh', N'Cải thiện sức bền và giữ lịch tập ổn định'),
    (N'member12.demo@sportiva.test', CONVERT(DATE,'1994-10-21'), N'Nam', N'Quận Bình Thạnh, TP. Hồ Chí Minh', N'Tăng sức mạnh và cải thiện thể lực'),
    (N'member13.demo@sportiva.test', CONVERT(DATE,'2001-02-08'), N'Nữ', N'Quận Tân Bình, TP. Hồ Chí Minh', N'Tập yoga để tăng độ linh hoạt'),
    (N'member14.demo@sportiva.test', CONVERT(DATE,'1996-08-14'), N'Nam', N'Thành phố Thủ Đức, TP. Hồ Chí Minh', N'Cải thiện kỹ thuật bơi'),
    (N'member15.demo@sportiva.test', CONVERT(DATE,'1998-12-03'), N'Nữ', N'Quận 7, TP. Hồ Chí Minh', N'Duy trì vóc dáng và sức khỏe'),
    (N'member16.demo@sportiva.test', CONVERT(DATE,'1992-06-29'), N'Nam', N'Quận Phú Nhuận, TP. Hồ Chí Minh', N'Luyện cầu lông và tăng sức bền'),
    (N'member17.demo@sportiva.test', CONVERT(DATE,'2000-04-11'), N'Nữ', N'Quận Gò Vấp, TP. Hồ Chí Minh', N'Tập thể lực toàn thân'),
    (N'member18.demo@sportiva.test', CONVERT(DATE,'1997-09-25'), N'Nam', N'Quận 3, TP. Hồ Chí Minh', N'Làm quen với bóng rổ'),
    (N'member19.demo@sportiva.test', CONVERT(DATE,'1995-01-19'), N'Nữ', N'Quận 11, TP. Hồ Chí Minh', N'Tăng độ dẻo dai và thư giãn'),
    (N'member20.demo@sportiva.test', CONVERT(DATE,'2002-07-06'), N'Nam', N'Quận 6, TP. Hồ Chí Minh', N'Tập boxing cơ bản và rèn thể lực'),
    (N'member21.demo@sportiva.test', CONVERT(DATE,'1991-11-27'), N'Nữ', N'Quận Tân Phú, TP. Hồ Chí Minh', N'Tập luyện đều đặn sau giờ làm'),
    (N'member22.demo@sportiva.test', CONVERT(DATE,'1999-03-13'), N'Nam', N'Quận 8, TP. Hồ Chí Minh', N'Tăng cơ và cải thiện sức mạnh'),
    (N'member23.demo@sportiva.test', CONVERT(DATE,'1996-05-22'), N'Nữ', N'Quận Bình Tân, TP. Hồ Chí Minh', N'Cải thiện sức bền tim mạch'),
    (N'member24.demo@sportiva.test', CONVERT(DATE,'2000-10-02'), N'Nam', N'Quận 12, TP. Hồ Chí Minh', N'Luyện tập bơi và cải thiện kỹ thuật'),
    (N'member25.demo@sportiva.test', CONVERT(DATE,'1993-04-17'), N'Nữ', N'Quận 1, TP. Hồ Chí Minh', N'Tập yoga và tăng khả năng vận động'),
    (N'member26.demo@sportiva.test', CONVERT(DATE,'1989-12-09'), N'Nam', N'Quận 5, TP. Hồ Chí Minh', N'Duy trì thể lực và sức khỏe'),
    (N'member27.demo@sportiva.test', CONVERT(DATE,'1998-07-30'), N'Nữ', N'Quận 10, TP. Hồ Chí Minh', N'Tăng sức mạnh và độ linh hoạt'),
    (N'member28.demo@sportiva.test', CONVERT(DATE,'1994-03-05'), N'Nam', N'Quận 2, TP. Hồ Chí Minh', N'Luyện cầu lông nâng cao'),
    (N'member29.demo@sportiva.test', CONVERT(DATE,'2001-06-24'), N'Nữ', N'Quận 9, TP. Hồ Chí Minh', N'Tập yoga và thư giãn'),
    (N'member30.demo@sportiva.test', CONVERT(DATE,'1990-02-12'), N'Nam', N'Quận 4, TP. Hồ Chí Minh', N'Rèn thể lực và kỹ thuật boxing'),
    (N'member.demo@sportiva.com', CONVERT(DATE,'1998-04-12'), N'Nữ', N'Quận 3, TP. Hồ Chí Minh', N'Tăng sức bền và duy trì vận động đều đặn')
) AS profile(email, dob, gender, address, goal)
JOIN @Accounts AS a ON a.email = profile.email
WHERE NOT EXISTS (SELECT 1 FROM dbo.member_profiles AS mp WHERE mp.member_id = a.user_id);

/* Tạo 28 kỳ gói: 24 còn hạn, 4 đã hết hạn, phục vụ báo cáo/demo đặt lớp. */
DECLARE @SubscriptionPlans TABLE (
    email NVARCHAR(255) NOT NULL,
    package_name NVARCHAR(255) NOT NULL,
    subscription_status NVARCHAR(30) NOT NULL,
    start_offset INT NOT NULL,
    end_offset INT NOT NULL,
    payment_method NVARCHAR(30) NOT NULL,
    seed_key NVARCHAR(100) NOT NULL
);
INSERT INTO @SubscriptionPlans VALUES
(N'member01.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -10, 19, N'CASH', N'SEED-PAID-M01'),
(N'member02.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -40, 49, N'BANK_TRANSFER', N'SEED-PAID-M02'),
(N'member03.demo@sportiva.test', N'Gói VIP 1 tháng', N'ACTIVE', -15, 14, N'BANK_TRANSFER', N'SEED-PAID-M03'),
(N'member04.demo@sportiva.test', N'Gói VIP 3 tháng', N'ACTIVE', -30, 59, N'CASH', N'SEED-PAID-M04'),
(N'member05.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -5, 24, N'CASH', N'SEED-PAID-M05'),
(N'member06.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -60, 29, N'BANK_TRANSFER', N'SEED-PAID-M06'),
(N'member07.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'EXPIRED', -100, -71, N'CASH', N'SEED-PAID-M07'),
(N'member08.demo@sportiva.test', N'Gói VIP 1 tháng', N'EXPIRED', -60, -31, N'BANK_TRANSFER', N'SEED-PAID-M08'),
(N'member11.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -4, 25, N'BANK_TRANSFER', N'SEED-PAID-M11'),
(N'member12.demo@sportiva.test', N'Gói VIP 1 tháng', N'ACTIVE', -10, 19, N'CASH', N'SEED-PAID-M12'),
(N'member13.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -35, 54, N'BANK_TRANSFER', N'SEED-PAID-M13'),
(N'member14.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -20, 9, N'CASH', N'SEED-PAID-M14'),
(N'member15.demo@sportiva.test', N'Gói VIP 3 tháng', N'ACTIVE', -40, 49, N'BANK_TRANSFER', N'SEED-PAID-M15'),
(N'member16.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -2, 27, N'CASH', N'SEED-PAID-M16'),
(N'member17.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -50, 39, N'BANK_TRANSFER', N'SEED-PAID-M17'),
(N'member18.demo@sportiva.test', N'Gói VIP 1 tháng', N'ACTIVE', -20, 9, N'CASH', N'SEED-PAID-M18'),
(N'member19.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -18, 11, N'BANK_TRANSFER', N'SEED-PAID-M19'),
(N'member20.demo@sportiva.test', N'Gói VIP 3 tháng', N'ACTIVE', -62, 27, N'CASH', N'SEED-PAID-M20'),
(N'member21.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -27, 2, N'BANK_TRANSFER', N'SEED-PAID-M21'),
(N'member22.demo@sportiva.test', N'Gói VIP 1 tháng', N'ACTIVE', -5, 24, N'CASH', N'SEED-PAID-M22'),
(N'member23.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -42, 47, N'BANK_TRANSFER', N'SEED-PAID-M23'),
(N'member24.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -12, 17, N'CASH', N'SEED-PAID-M24'),
(N'member25.demo@sportiva.test', N'Gói VIP 3 tháng', N'ACTIVE', -30, 59, N'BANK_TRANSFER', N'SEED-PAID-M25'),
(N'member26.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'ACTIVE', -8, 21, N'CASH', N'SEED-PAID-M26'),
(N'member27.demo@sportiva.test', N'Gói VIP 1 tháng', N'ACTIVE', -24, 5, N'BANK_TRANSFER', N'SEED-PAID-M27'),
(N'member28.demo@sportiva.test', N'Gói STANDARD 3 tháng', N'ACTIVE', -56, 33, N'CASH', N'SEED-PAID-M28'),
(N'member29.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'EXPIRED', -90, -61, N'BANK_TRANSFER', N'SEED-PAID-M29'),
(N'member30.demo@sportiva.test', N'Gói VIP 1 tháng', N'EXPIRED', -70, -41, N'CASH', N'SEED-PAID-M30');

DECLARE @CreatedSubscriptions TABLE (member_id INT PRIMARY KEY, subscription_id INT NOT NULL);
INSERT INTO dbo.member_subscriptions (member_id, package_id, start_date, end_date, status)
OUTPUT inserted.member_id, inserted.subscription_id
    INTO @CreatedSubscriptions (member_id, subscription_id)
SELECT a.user_id, pkg.package_id,
       DATEADD(DAY, seed_plan.start_offset, @Today),
       DATEADD(DAY, seed_plan.end_offset, @Today),
       seed_plan.subscription_status
FROM @SubscriptionPlans AS seed_plan
JOIN @Accounts AS a ON a.email = seed_plan.email
JOIN dbo.membership_packages AS pkg ON pkg.package_name = seed_plan.package_name
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.membership_orders AS existing_order
    WHERE existing_order.created_by = a.user_id AND existing_order.idempotency_key = seed_plan.seed_key
);

DECLARE @CreatedOrders TABLE (member_id INT PRIMARY KEY, order_id INT NOT NULL);
INSERT INTO dbo.membership_orders (
    member_id, package_id, order_kind, source_subscription_id, source_package_id,
    package_name_snapshot, package_price_snapshot, package_duration_days_snapshot,
    package_status_snapshot, payment_method, status, idempotency_key, request_fingerprint,
    created_by, confirmed_by, bank_transaction_id, confirmation_key, confirmation_fingerprint,
    version, created_at, confirmed_at
)
OUTPUT inserted.member_id, inserted.membership_order_id INTO @CreatedOrders (member_id, order_id)
SELECT a.user_id, pkg.package_id, N'NEW', NULL, NULL,
       pkg.package_name, pkg.price, pkg.duration_days, pkg.status, seed_plan.payment_method,
       N'CONFIRMED', seed_plan.seed_key, REPLICATE(N'A', 64), a.user_id, receptionist.user_id,
       CASE WHEN seed_plan.payment_method = N'BANK_TRANSFER' THEN CONCAT(N'DEMO-BANK-', a.user_id) END,
       CONCAT(N'SEED-CONFIRM-', a.user_id), REPLICATE(N'B', 64), 1,
       DATEADD(HOUR, 9, CONVERT(DATETIME2, DATEADD(DAY, seed_plan.start_offset, @Today))),
       DATEADD(MINUTE, 5, DATEADD(HOUR, 9, CONVERT(DATETIME2, DATEADD(DAY, seed_plan.start_offset, @Today))))
FROM @SubscriptionPlans AS seed_plan
JOIN @Accounts AS a ON a.email = seed_plan.email
JOIN @CreatedSubscriptions AS new_sub ON new_sub.member_id = a.user_id
JOIN dbo.membership_packages AS pkg ON pkg.package_name = seed_plan.package_name
CROSS JOIN (SELECT user_id FROM @Accounts WHERE email = N'reception.demo@sportiva.test') AS receptionist;

INSERT INTO dbo.invoices (
    subscription_id, membership_order_id, member_id, receptionist_id, amount,
    currency, payment_method, payment_status, created_at, paid_at
)
SELECT new_sub.subscription_id, new_order.order_id, a.user_id, receptionist.user_id,
       pkg.price, 'VND', seed_plan.payment_method, N'PAID', order_row.created_at, order_row.confirmed_at
FROM @SubscriptionPlans AS seed_plan
JOIN @Accounts AS a ON a.email = seed_plan.email
JOIN @CreatedSubscriptions AS new_sub ON new_sub.member_id = a.user_id
JOIN @CreatedOrders AS new_order ON new_order.member_id = a.user_id
JOIN dbo.membership_orders AS order_row ON order_row.membership_order_id = new_order.order_id
JOIN dbo.membership_packages AS pkg ON pkg.package_name = seed_plan.package_name
CROSS JOIN (SELECT user_id FROM @Accounts WHERE email = N'reception.demo@sportiva.test') AS receptionist;

/* Hai đơn đang chờ minh họa tiền mặt và chuyển khoản; chưa có subscription/hóa đơn PAID. */
DECLARE @PendingPlans TABLE (email NVARCHAR(255), package_name NVARCHAR(255), payment_method NVARCHAR(30), seed_key NVARCHAR(100));
INSERT INTO @PendingPlans VALUES
(N'member09.demo@sportiva.test', N'Gói STANDARD 1 tháng', N'CASH', N'SEED-PENDING-M09'),
(N'member10.demo@sportiva.test', N'Gói VIP 1 tháng', N'BANK_TRANSFER', N'SEED-PENDING-M10');
DECLARE @CreatedPendingOrders TABLE (member_id INT PRIMARY KEY, order_id INT NOT NULL);
INSERT INTO dbo.membership_orders (
    member_id, package_id, order_kind, source_subscription_id, source_package_id,
    package_name_snapshot, package_price_snapshot, package_duration_days_snapshot,
    package_status_snapshot, payment_method, status, idempotency_key, request_fingerprint,
    created_by, version, created_at
)
OUTPUT inserted.member_id, inserted.membership_order_id INTO @CreatedPendingOrders (member_id, order_id)
SELECT a.user_id, pkg.package_id, N'NEW', NULL, NULL, pkg.package_name, pkg.price,
       pkg.duration_days, pkg.status, seed_plan.payment_method, N'PENDING_PAYMENT', seed_plan.seed_key,
       REPLICATE(N'C', 64), a.user_id, 0, DATEADD(MINUTE, -20, SYSDATETIME())
FROM @PendingPlans AS seed_plan
JOIN @Accounts AS a ON a.email = seed_plan.email
JOIN dbo.membership_packages AS pkg ON pkg.package_name = seed_plan.package_name
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.membership_orders AS order_row
    WHERE order_row.created_by = a.user_id AND order_row.idempotency_key = seed_plan.seed_key
)
AND NOT EXISTS (
    SELECT 1 FROM dbo.membership_orders AS pending
    WHERE pending.member_id = a.user_id AND pending.status = N'PENDING_PAYMENT'
);

INSERT INTO dbo.invoices (membership_order_id, member_id, amount, currency, payment_method, payment_status, created_at)
SELECT pending_order.order_id, a.user_id, pkg.price, 'VND', seed_plan.payment_method, N'PENDING', DATEADD(MINUTE, -20, SYSDATETIME())
FROM @PendingPlans AS seed_plan
JOIN @Accounts AS a ON a.email = seed_plan.email
JOIN @CreatedPendingOrders AS pending_order ON pending_order.member_id = a.user_id
JOIN dbo.membership_packages AS pkg ON pkg.package_name = seed_plan.package_name;

/* Lịch sử thông báo kích hoạt chỉ tạo cho đơn seed đã xác nhận và hóa đơn PAID. */
INSERT INTO dbo.membership_notifications (order_id, member_id, content, created_at)
SELECT membership_order.membership_order_id, membership_order.member_id,
       CONCAT(N'Gói ', membership_order.package_name_snapshot, N' đã thanh toán và được kích hoạt.'),
       COALESCE(membership_order.confirmed_at, membership_order.created_at)
FROM dbo.membership_orders AS membership_order
JOIN dbo.invoices AS invoice_row ON invoice_row.membership_order_id = membership_order.membership_order_id
WHERE membership_order.idempotency_key LIKE N'SEED-PAID-M%'
  AND membership_order.status = N'CONFIRMED'
  AND invoice_row.payment_status = N'PAID'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.membership_notifications AS existing
      WHERE existing.order_id = membership_order.membership_order_id
  );

/* Lịch sử GENERAL cho demo: thông báo lịch tới hội viên và nhắc các đơn đang chờ.
   Bỏ qua khi database chưa áp dụng V9; không tạo sự kiện thanh toán giả. */
IF OBJECT_ID(N'dbo.general_notifications', N'U') IS NOT NULL
BEGIN
    DECLARE @GeneralNotificationSeedSql NVARCHAR(MAX) = N'
        DECLARE @AnnouncementAt DATETIME2 = DATEADD(DAY, -1, SYSDATETIME());
        INSERT INTO dbo.general_notifications
            (sender_id, recipient_id, title, content, link, created_at, read_at)
        SELECT manager.user_id, member.user_id,
               N''Lịch hoạt động tuần này'',
               N''Trung tâm đã cập nhật lịch các lớp. Vui lòng xem mục Lịch để kiểm tra các buổi đã đăng ký.'',
               N''/schedule'', @AnnouncementAt,
               CASE WHEN member.user_id % 3 = 0 THEN DATEADD(HOUR, 2, @AnnouncementAt) END
        FROM dbo.users AS manager
        JOIN dbo.roles AS manager_role ON manager_role.role_id = manager.role_id
        CROSS JOIN dbo.users AS member
        JOIN dbo.roles AS member_role ON member_role.role_id = member.role_id
        WHERE manager.email = N''manager.demo@sportiva.test''
          AND manager_role.role_name = N''CENTER_MANAGER''
          AND member_role.role_name = N''MEMBER''
          AND member.status = N''ACTIVE''
          AND (member.email LIKE N''member[0-9][0-9].demo@sportiva.test''
               OR member.email = N''member.demo@sportiva.com'')
          AND NOT EXISTS (
              SELECT 1 FROM dbo.general_notifications AS existing
              WHERE existing.sender_id = manager.user_id
                AND existing.recipient_id = member.user_id
                AND existing.title = N''Lịch hoạt động tuần này''
          );

        DECLARE @SpecificNotices TABLE (
            recipient_email NVARCHAR(255) NOT NULL,
            title NVARCHAR(150) NOT NULL,
            content NVARCHAR(4000) NOT NULL,
            link NVARCHAR(500) NOT NULL,
            read_after_hours INT NULL
        );
        INSERT INTO @SpecificNotices VALUES
            (N''member09.demo@sportiva.test'', N''Đơn gói đang chờ thanh toán'',
             N''Đơn đăng ký gói của bạn đã được tạo. Gói sẽ được kích hoạt sau khi thanh toán được xác nhận.'', N''/memberships'', 2),
            (N''member10.demo@sportiva.test'', N''Đơn gói đang chờ thanh toán'',
             N''Đơn đăng ký gói của bạn đã được tạo. Gói sẽ được kích hoạt sau khi thanh toán được xác nhận.'', N''/memberships'', NULL),
            (N''member21.demo@sportiva.test'', N''Gói hội viên sắp hết hạn'',
             N''Gói hiện tại của bạn sắp hết hạn. Hãy xem mục Hội viên để gia hạn.'', N''/memberships'', 1);

        DECLARE @SpecificNoticeAt DATETIME2 = DATEADD(HOUR, -8, SYSDATETIME());
        INSERT INTO dbo.general_notifications
            (sender_id, recipient_id, title, content, link, created_at, read_at)
        SELECT manager.user_id, member.user_id, notice.title, notice.content, notice.link,
               @SpecificNoticeAt,
               CASE WHEN notice.read_after_hours IS NOT NULL
                    THEN DATEADD(HOUR, notice.read_after_hours, @SpecificNoticeAt) END
        FROM @SpecificNotices AS notice
        JOIN dbo.users AS manager ON manager.email = N''manager.demo@sportiva.test''
        JOIN dbo.users AS member ON member.email = notice.recipient_email
        WHERE NOT EXISTS (
            SELECT 1 FROM dbo.general_notifications AS existing
            WHERE existing.sender_id = manager.user_id
              AND existing.recipient_id = member.user_id
              AND existing.title = notice.title
        );';
    EXEC sys.sp_executesql @GeneralNotificationSeedSql;
END;

/* Mười chín buổi học trải đều trong hai tuần, có lịch sử và lớp sắp diễn ra. */
DECLARE @ClassPlans TABLE (
    session_no INT, class_name NVARCHAR(255), sport_name NVARCHAR(255), coach_email NVARCHAR(255), room_name NVARCHAR(255),
    day_offset INT, start_minute INT, capacity INT, duration INT, access_level NVARCHAR(30), class_status NVARCHAR(30),
    booking_target INT
);
INSERT INTO @ClassPlans VALUES
(1, N'Cầu lông cơ bản - ca sáng', N'Cầu lông', N'coach1.demo@sportiva.test', N'Sân đa năng 1', -2, 540, 16, 60, N'STANDARD', N'COMPLETED', 10),
(2, N'Yoga phục hồi - ca tối', N'Yoga', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', -1, 1080, 14, 60, N'STANDARD', N'COMPLETED', 10),
(3, N'Bóng rổ kỹ thuật - nhập môn', N'Bóng rổ', N'coach1.demo@sportiva.test', N'Sân đa năng 2', 1, 600, 18, 75, N'STANDARD', N'SCHEDULED', 12),
(4, N'Bơi lội căn bản - ca chiều', N'Bơi lội', N'coach3.demo@sportiva.test', N'Hồ bơi', 2, 900, 10, 60, N'STANDARD', N'SCHEDULED', 7),
(5, N'Fitness VIP - sức mạnh', N'Fitness', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 3, 660, 12, 75, N'VIP', N'SCHEDULED', 6),
(6, N'Yoga nền tảng - buổi sáng', N'Yoga', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', -14, 420, 14, 60, N'STANDARD', N'COMPLETED', 10),
(7, N'Cầu lông trung cấp - ca tối', N'Cầu lông', N'coach1.demo@sportiva.test', N'Sân đa năng 1', -11, 1080, 16, 75, N'STANDARD', N'COMPLETED', 11),
(8, N'Bơi kỹ thuật - ca sáng', N'Bơi lội', N'coach3.demo@sportiva.test', N'Hồ bơi', -8, 540, 10, 60, N'STANDARD', N'COMPLETED', 8),
(9, N'Boxing căn bản - ca tối', N'Boxing', N'coach3.demo@sportiva.test', N'Sân đa năng 2', -5, 1080, 12, 60, N'STANDARD', N'COMPLETED', 8),
(10, N'Fitness circuit - ca tối', N'Fitness', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 1, 1080, 14, 60, N'STANDARD', N'SCHEDULED', 10),
(11, N'Yoga giãn cơ - ca sáng', N'Yoga', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 2, 450, 14, 60, N'STANDARD', N'SCHEDULED', 10),
(12, N'Cầu lông nhập môn - ca sáng', N'Cầu lông', N'coach1.demo@sportiva.test', N'Sân đa năng 1', 3, 540, 16, 60, N'STANDARD', N'SCHEDULED', 11),
(13, N'Boxing cardio - ca tối', N'Boxing', N'coach3.demo@sportiva.test', N'Sân đa năng 2', 3, 1140, 12, 60, N'STANDARD', N'SCHEDULED', 8),
(14, N'Rèn sức mạnh toàn thân', N'Fitness', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 4, 600, 14, 75, N'VIP', N'SCHEDULED', 6),
(15, N'Bơi sức bền - ca chiều', N'Bơi lội', N'coach3.demo@sportiva.test', N'Hồ bơi', 4, 900, 10, 60, N'STANDARD', N'SCHEDULED', 8),
(16, N'Bóng rổ phối hợp - ca sáng', N'Bóng rổ', N'coach1.demo@sportiva.test', N'Sân đa năng 2', 5, 600, 18, 75, N'STANDARD', N'SCHEDULED', 12),
(17, N'Yoga thư giãn - buổi trưa', N'Yoga', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 5, 720, 14, 60, N'STANDARD', N'SCHEDULED', 10),
(18, N'Fitness linh hoạt - ca tối', N'Fitness', N'coach2.demo@sportiva.test', N'Phòng tập nhóm', 6, 1080, 14, 60, N'STANDARD', N'SCHEDULED', 10),
(19, N'Boxing di chuyển - ca sáng', N'Boxing', N'coach3.demo@sportiva.test', N'Sân đa năng 1', 7, 600, 12, 60, N'STANDARD', N'SCHEDULED', 8);

INSERT INTO dbo.classes (
    class_name, sport_id, coach_id, room_id, max_capacity, schedule_time,
    duration_minutes, required_access_level, status
)
SELECT seed_plan.class_name, sport.sport_id, coach.user_id, room.room_id, seed_plan.capacity,
       DATEADD(MINUTE, seed_plan.start_minute, CONVERT(DATETIME2, DATEADD(DAY, seed_plan.day_offset, @Today))),
       seed_plan.duration, seed_plan.access_level, seed_plan.class_status
FROM @ClassPlans AS seed_plan
JOIN dbo.sports AS sport ON sport.sport_name = seed_plan.sport_name
JOIN @Accounts AS coach ON coach.email = seed_plan.coach_email AND coach.role_name = N'COACH'
JOIN dbo.rooms AS room ON room.room_name = seed_plan.room_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.classes AS existing WHERE existing.class_name = seed_plan.class_name);

DECLARE @SeedClasses TABLE (class_name NVARCHAR(255) PRIMARY KEY, class_id INT NOT NULL);
INSERT INTO @SeedClasses (class_name, class_id)
SELECT seed_plan.class_name, c.class_id
FROM @ClassPlans AS seed_plan
JOIN dbo.classes AS c ON c.class_name = seed_plan.class_name;

/* Chỉ xếp hội viên có gói còn hạn; gói STANDARD không đăng ký lớp VIP. */
DECLARE @EligibleBookingMembers TABLE (email NVARCHAR(255) PRIMARY KEY, member_no INT NOT NULL, access_level NVARCHAR(30) NOT NULL);
INSERT INTO @EligibleBookingMembers (email, member_no, access_level)
SELECT active_member.email,
       ROW_NUMBER() OVER (ORDER BY active_member.email),
       package.access_level
FROM @SubscriptionPlans AS subscription_plan
JOIN @Accounts AS active_member ON active_member.email = subscription_plan.email AND active_member.role_name = N'MEMBER'
JOIN dbo.membership_packages AS package ON package.package_name = subscription_plan.package_name
WHERE subscription_plan.subscription_status = N'ACTIVE';

/* Mỗi buổi có 6–12 lượt đặt; danh sách hội viên thay đổi giữa các buổi. */
DECLARE @BookingPlans TABLE (class_name NVARCHAR(255), member_email NVARCHAR(255));
INSERT INTO @BookingPlans (class_name, member_email)
SELECT class_plan.class_name, selected.email
FROM @ClassPlans AS class_plan
CROSS APPLY (
    SELECT TOP (class_plan.booking_target) member.email
    FROM @EligibleBookingMembers AS member
    WHERE (class_plan.access_level = N'STANDARD' OR member.access_level = N'VIP')
      AND (member.member_no + class_plan.session_no) % 4 <> 0
    ORDER BY member.member_no
) AS selected;

INSERT INTO dbo.class_bookings (class_id, member_id, booked_at, status)
SELECT c.class_id, member.user_id, DATEADD(DAY, -7, class_row.schedule_time), N'BOOKED'
FROM @BookingPlans AS seed_plan
JOIN @SeedClasses AS c ON c.class_name = seed_plan.class_name
JOIN @Accounts AS member ON member.email = seed_plan.member_email
JOIN dbo.classes AS class_row ON class_row.class_id = c.class_id
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.class_bookings AS existing
    WHERE existing.class_id = c.class_id AND existing.member_id = member.user_id
);

/* Điểm danh chỉ cho hai lớp đã hoàn thành; HLV của lớp là người ghi nhận. */
INSERT INTO dbo.attendances (class_id, member_id, checked_in_by, checked_in_at, status)
SELECT c.class_id, member.user_id, class_row.coach_id,
       DATEADD(MINUTE, 10, class_row.schedule_time), attendance.status
FROM (VALUES
    (N'Cầu lông cơ bản - ca sáng', N'member01.demo@sportiva.test', N'PRESENT'),
    (N'Cầu lông cơ bản - ca sáng', N'member02.demo@sportiva.test', N'PRESENT'),
    (N'Cầu lông cơ bản - ca sáng', N'member05.demo@sportiva.test', N'ABSENT'),
    (N'Yoga phục hồi - ca tối', N'member03.demo@sportiva.test', N'PRESENT'),
    (N'Yoga phục hồi - ca tối', N'member06.demo@sportiva.test', N'PRESENT')
) AS attendance(class_name, member_email, status)
JOIN @SeedClasses AS c ON c.class_name = attendance.class_name
JOIN dbo.classes AS class_row ON class_row.class_id = c.class_id
JOIN @Accounts AS member ON member.email = attendance.member_email
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.attendances AS existing
    WHERE existing.class_id = c.class_id AND existing.member_id = member.user_id
);

/* Lấp điểm danh còn thiếu cho các booking của những buổi đã hoàn thành. */
INSERT INTO dbo.attendances (class_id, member_id, checked_in_by, checked_in_at, status)
SELECT class_row.class_id, booking.member_id, class_row.coach_id,
       DATEADD(MINUTE, 10, class_row.schedule_time),
       CASE WHEN CHECKSUM(CONCAT(class_row.class_name, N'-', member.email)) % 5 = 0
            THEN N'ABSENT' ELSE N'PRESENT' END
FROM dbo.classes AS class_row
JOIN dbo.class_bookings AS booking ON booking.class_id = class_row.class_id AND booking.status = N'BOOKED'
JOIN dbo.users AS member ON member.user_id = booking.member_id
WHERE class_row.status = N'COMPLETED'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.attendances AS existing
      WHERE existing.class_id = class_row.class_id AND existing.member_id = booking.member_id
  );

/* Phản hồi hội viên sau hai buổi đã hoàn thành. */
INSERT INTO dbo.feedbacks (from_user_id, to_user_id, class_id, rating, comment, [type], created_at)
SELECT member.user_id, class_row.coach_id, c.class_id, feedback.rating, feedback.comment,
       N'MEMBER_TO_COACH', DATEADD(DAY, -1, SYSDATETIME())
FROM (VALUES
    (N'Cầu lông cơ bản - ca sáng', N'member01.demo@sportiva.test', 5, N'HLV hướng dẫn dễ hiểu, buổi tập đúng giờ.'),
    (N'Yoga phục hồi - ca tối', N'member03.demo@sportiva.test', 4, N'Không gian thoải mái, bài tập phù hợp người mới.')
) AS feedback(class_name, member_email, rating, comment)
JOIN @SeedClasses AS c ON c.class_name = feedback.class_name
JOIN dbo.classes AS class_row ON class_row.class_id = c.class_id
JOIN @Accounts AS member ON member.email = feedback.member_email
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.feedbacks AS existing
    WHERE existing.from_user_id = member.user_id AND existing.class_id = c.class_id
      AND existing.[type] = N'MEMBER_TO_COACH'
);

/* Ticket hỗ trợ: một ticket đang mở, một ticket đã được lễ tân xử lý. */
INSERT INTO dbo.support_tickets (member_id, subject, content, status, response, resolved_by, created_at, resolved_at)
SELECT member.user_id, ticket.subject, ticket.content, ticket.status, ticket.response,
       CASE WHEN ticket.status = N'RESOLVED' THEN receptionist.user_id END,
       DATEADD(DAY, -ticket.day_offset, SYSDATETIME()),
       CASE WHEN ticket.status = N'RESOLVED' THEN DATEADD(DAY, -ticket.day_offset, SYSDATETIME()) END
FROM (VALUES
    (N'member02.demo@sportiva.test', N'Hỏi về lịch lớp', N'Tôi muốn biết lịch lớp bóng rổ tuần này có thay đổi không.', N'OPEN', CAST(NULL AS NVARCHAR(MAX)), 1),
    (N'member04.demo@sportiva.test', N'Cập nhật thông tin hồ sơ', N'Nhờ trung tâm hướng dẫn cập nhật số điện thoại liên hệ.', N'RESOLVED', N'Lễ tân đã hướng dẫn cập nhật tại quầy.', 5)
) AS ticket(email, subject, content, status, response, day_offset)
JOIN @Accounts AS member ON member.email = ticket.email
CROSS JOIN (SELECT user_id FROM @Accounts WHERE email = N'reception.demo@sportiva.test') AS receptionist
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.support_tickets AS existing
    WHERE existing.member_id = member.user_id AND existing.subject = ticket.subject
);

/* Kế hoạch và nhật ký tập mẫu cho HLV theo dõi tiến độ hội viên/lớp. */
INSERT INTO dbo.workout_plans (title, coach_id, member_id, class_id, description, created_at)
SELECT seed_plan.title, coach.user_id, member.user_id, class_row.class_id, seed_plan.description, DATEADD(DAY, -2, SYSDATETIME())
FROM (VALUES
    (N'Kế hoạch sức bền 4 tuần', N'coach1.demo@sportiva.test', N'member01.demo@sportiva.test', CAST(NULL AS NVARCHAR(255)), N'Tăng dần thời lượng vận động, ưu tiên kỹ thuật và nhịp tim ổn định.'),
    (N'Kế hoạch linh hoạt và phục hồi', N'coach2.demo@sportiva.test', N'member03.demo@sportiva.test', CAST(NULL AS NVARCHAR(255)), N'Tập giãn cơ, thăng bằng và hít thở; tăng độ khó theo khả năng.'),
    (N'Giáo án lớp Fitness VIP', N'coach2.demo@sportiva.test', CAST(NULL AS NVARCHAR(255)), N'Fitness VIP - sức mạnh', N'Khởi động, bài sức mạnh toàn thân và thả lỏng cuối buổi.')
) AS seed_plan(title, coach_email, member_email, class_name, description)
JOIN @Accounts AS coach ON coach.email = seed_plan.coach_email
LEFT JOIN @Accounts AS member ON member.email = seed_plan.member_email
LEFT JOIN @SeedClasses AS seed_class ON seed_class.class_name = seed_plan.class_name
LEFT JOIN dbo.classes AS class_row ON class_row.class_id = seed_class.class_id
WHERE NOT EXISTS (SELECT 1 FROM dbo.workout_plans AS existing WHERE existing.title = seed_plan.title);

DECLARE @SeedLogs TABLE (member_id INT, coach_id INT, schedule_id INT, log_id INT);
INSERT INTO dbo.workout_logs (member_id, coach_id, schedule_id, feedback_from_coach, created_at)
OUTPUT inserted.member_id, inserted.coach_id, inserted.schedule_id, inserted.id INTO @SeedLogs
SELECT member.user_id, coach.user_id, class_row.class_id, log_seed.feedback,
       DATEADD(MINUTE, 20, class_row.schedule_time)
FROM (VALUES
    (N'member01.demo@sportiva.test', N'coach1.demo@sportiva.test', N'Cầu lông cơ bản - ca sáng', N'Duy trì nhịp di chuyển tốt; tập thêm bước chân ngang.'),
    (N'member03.demo@sportiva.test', N'coach2.demo@sportiva.test', N'Yoga phục hồi - ca tối', N'Khả năng giữ thăng bằng tiến bộ; không ép sâu tư thế.'),
    (N'member05.demo@sportiva.test', N'coach1.demo@sportiva.test', N'Cầu lông cơ bản - ca sáng', N'Cần tập trung vào tư thế chuẩn bị trước khi trả cầu.')
) AS log_seed(member_email, coach_email, class_name, feedback)
JOIN @Accounts AS member ON member.email = log_seed.member_email
JOIN @Accounts AS coach ON coach.email = log_seed.coach_email
JOIN @SeedClasses AS seed_class ON seed_class.class_name = log_seed.class_name
JOIN dbo.classes AS class_row ON class_row.class_id = seed_class.class_id
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.workout_logs AS existing
    WHERE existing.member_id = member.user_id AND existing.schedule_id = class_row.class_id
);

INSERT INTO dbo.workout_log_details (log_id, exercise_name, sets, reps, weight_kg)
SELECT log_seed.log_id, detail.exercise_name, detail.sets, detail.reps, detail.weight_kg
FROM @SeedLogs AS log_seed
CROSS APPLY (VALUES
    (N'Khởi động toàn thân', 1, 10, CAST(NULL AS DECIMAL(8,2))),
    (N'Bài kỹ thuật chính', 3, 12, CAST(5.00 AS DECIMAL(8,2)))
) AS detail(exercise_name, sets, reps, weight_kg)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.workout_log_details AS existing
    WHERE existing.log_id = log_seed.log_id AND existing.exercise_name = detail.exercise_name
);

COMMIT TRANSACTION;

/* Báo cáo số lượng để kiểm tra sau khi seed. */
SELECT r.role_name, COUNT(u.user_id) AS account_count
FROM dbo.roles AS r LEFT JOIN dbo.users AS u ON u.role_id = r.role_id
GROUP BY r.role_name ORDER BY r.role_name;
SELECT N'member_profiles' AS table_name, COUNT(*) AS row_count FROM dbo.member_profiles
UNION ALL SELECT N'classes', COUNT(*) FROM dbo.classes
UNION ALL SELECT N'member_subscriptions', COUNT(*) FROM dbo.member_subscriptions
UNION ALL SELECT N'membership_orders', COUNT(*) FROM dbo.membership_orders
UNION ALL SELECT N'membership_notifications', COUNT(*) FROM dbo.membership_notifications
UNION ALL SELECT N'invoices', COUNT(*) FROM dbo.invoices
UNION ALL SELECT N'payment_transactions', COUNT(*) FROM dbo.payment_transactions
UNION ALL SELECT N'bank_payment_events', COUNT(*) FROM dbo.bank_payment_events
UNION ALL SELECT N'center_bank_account', COUNT(*) FROM dbo.center_bank_account
UNION ALL SELECT N'class_bookings', COUNT(*) FROM dbo.class_bookings
UNION ALL SELECT N'attendances', COUNT(*) FROM dbo.attendances
UNION ALL SELECT N'feedbacks', COUNT(*) FROM dbo.feedbacks
UNION ALL SELECT N'support_tickets', COUNT(*) FROM dbo.support_tickets
UNION ALL SELECT N'workout_plans', COUNT(*) FROM dbo.workout_plans
UNION ALL SELECT N'workout_logs', COUNT(*) FROM dbo.workout_logs
UNION ALL SELECT N'workout_log_details', COUNT(*) FROM dbo.workout_log_details;
IF OBJECT_ID(N'dbo.general_notifications', N'U') IS NOT NULL
    EXEC(N'SELECT N''general_notifications'' AS table_name, COUNT(*) AS row_count FROM dbo.general_notifications;');

END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    SELECT ERROR_NUMBER() AS error_number,
           ERROR_LINE() AS error_line,
           ERROR_MESSAGE() AS error_message;
    THROW;
END CATCH;
