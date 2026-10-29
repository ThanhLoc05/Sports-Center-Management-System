/*
    TAO LAI DATABASE SPORTSCENTERDB - SQL SERVER 2019

    CANH BAO: Script nay xoa vinh vien database SportsCenterDB cu va toan bo du lieu ben trong.
    Hay sao luu database truoc neu can giu lai tai khoan, lop, hoa don hoac lich su.

    Cach chay: mo file trong SSMS, ket noi dung SQL Server, bam Execute (F5).
    Tai khoan SQL can quyen ALTER/DROP database va CREATE DATABASE.
    Script tao schema theo backend goc src/main, them danh muc bo mon, phong va goi mau.
    Script khong tao tai khoan/coaches vi mat khau phai duoc ma hoa BCrypt.
*/
USE master;
GO

IF DB_ID(N'SportsCenterDB') IS NOT NULL
BEGIN
    ALTER DATABASE [SportsCenterDB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [SportsCenterDB];
END;
GO

CREATE DATABASE [SportsCenterDB];
GO
USE [SportsCenterDB];
GO
/*
  SportsCenterDB baseline schema for SQL Server.

  Run against a newly created, empty SportsCenterDB. This is intentionally
  not an automatic Flyway migration. It creates missing objects but does not
  alter or repair existing tables. Review and migrate existing data separately.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.roles (
        role_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
        role_name NVARCHAR(255) NOT NULL,
        CONSTRAINT UQ_roles_role_name UNIQUE (role_name)
    );
END;

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        user_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        full_name NVARCHAR(255) NOT NULL,
        phone NVARCHAR(255) NOT NULL,
        role_id INT NOT NULL,
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_users_status DEFAULT N'ACTIVE',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT UQ_users_phone UNIQUE (phone),
        CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id),
        CONSTRAINT CK_users_status CHECK (status IN (N'ACTIVE', N'INACTIVE', N'BLOCKED'))
    );
END;

IF OBJECT_ID(N'dbo.member_profiles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.member_profiles (
        member_id INT NOT NULL CONSTRAINT PK_member_profiles PRIMARY KEY,
        dob DATE NULL,
        gender NVARCHAR(255) NULL,
        address NVARCHAR(255) NULL,
        fitness_goals NVARCHAR(255) NULL,
        CONSTRAINT FK_member_profiles_users FOREIGN KEY (member_id) REFERENCES dbo.users(user_id)
    );
END;

IF OBJECT_ID(N'dbo.sports', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sports (
        sport_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sports PRIMARY KEY,
        sport_name NVARCHAR(255) NOT NULL,
        description NVARCHAR(255) NULL,
        CONSTRAINT UQ_sports_sport_name UNIQUE (sport_name)
    );
END;

IF OBJECT_ID(N'dbo.rooms', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.rooms (
        room_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rooms PRIMARY KEY,
        room_name NVARCHAR(255) NOT NULL,
        capacity INT NOT NULL,
        CONSTRAINT UQ_rooms_room_name UNIQUE (room_name),
        CONSTRAINT CK_rooms_capacity CHECK (capacity > 0)
    );
END;

IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_packages (
        package_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_packages PRIMARY KEY,
        package_name NVARCHAR(255) NOT NULL,
        duration_days INT NOT NULL,
        price DECIMAL(18,2) NOT NULL,
        access_level NVARCHAR(30) NOT NULL CONSTRAINT DF_membership_packages_access_level DEFAULT N'STANDARD',
        description NVARCHAR(255) NULL,
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_membership_packages_status DEFAULT N'ACTIVE',
        CONSTRAINT CK_membership_packages_duration CHECK (duration_days > 0),
        CONSTRAINT CK_membership_packages_price CHECK (price >= 0),
        CONSTRAINT CK_membership_packages_access_level CHECK (access_level IN (N'STANDARD', N'VIP')),
        CONSTRAINT CK_membership_packages_status CHECK (status IN (N'ACTIVE', N'INACTIVE'))
    );
END;

/* A row represents one scheduled session. Access is granted by an active package. */
IF OBJECT_ID(N'dbo.classes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.classes (
        class_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_classes PRIMARY KEY,
        class_name NVARCHAR(255) NOT NULL,
        sport_id INT NOT NULL,
        coach_id INT NOT NULL,
        room_id INT NOT NULL,
        max_capacity INT NOT NULL,
        schedule_time DATETIME2 NOT NULL,
        duration_minutes INT NOT NULL,
        required_access_level NVARCHAR(30) NOT NULL CONSTRAINT DF_classes_access_level DEFAULT N'STANDARD',
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_classes_status DEFAULT N'SCHEDULED',
        CONSTRAINT FK_classes_sports FOREIGN KEY (sport_id) REFERENCES dbo.sports(sport_id),
        CONSTRAINT FK_classes_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_classes_rooms FOREIGN KEY (room_id) REFERENCES dbo.rooms(room_id),
        CONSTRAINT CK_classes_capacity CHECK (max_capacity > 0),
        CONSTRAINT CK_classes_duration CHECK (duration_minutes > 0),
        CONSTRAINT CK_classes_access_level CHECK (required_access_level IN (N'STANDARD', N'VIP')),
        CONSTRAINT CK_classes_status CHECK (status IN (N'SCHEDULED', N'CANCELLED', N'COMPLETED'))
    );
END;

IF OBJECT_ID(N'dbo.member_subscriptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.member_subscriptions (
        subscription_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_member_subscriptions PRIMARY KEY,
        member_id INT NOT NULL,
        package_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_member_subscriptions_status DEFAULT N'PENDING_PAYMENT',
        CONSTRAINT FK_member_subscriptions_users FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_member_subscriptions_packages FOREIGN KEY (package_id) REFERENCES dbo.membership_packages(package_id),
        CONSTRAINT CK_member_subscriptions_dates CHECK (end_date >= start_date),
        CONSTRAINT CK_member_subscriptions_status CHECK (status IN (N'PENDING_PAYMENT', N'ACTIVE', N'EXPIRED', N'CANCELLED'))
    );
END;

/* Đơn đăng ký/gia hạn lưu ảnh chụp giá gói và chỉ được kích hoạt sau khi thu tiền. */
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

/* Eligible members book directly; membership payment is handled by the package invoice. */
IF OBJECT_ID(N'dbo.class_bookings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.class_bookings (
        booking_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_class_bookings PRIMARY KEY,
        class_id INT NOT NULL,
        member_id INT NOT NULL,
        booked_at DATETIME2 NOT NULL CONSTRAINT DF_class_bookings_booked_at DEFAULT SYSDATETIME(),
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_class_bookings_status DEFAULT N'BOOKED',
        CONSTRAINT FK_class_bookings_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT FK_class_bookings_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT UQ_class_bookings_member_class UNIQUE (class_id, member_id),
        CONSTRAINT CK_class_bookings_status CHECK (status IN (N'BOOKED', N'CANCELLED'))
    );
END;

/* Invoices represent package purchases or unrelated/manual charges. */
IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoices (
        invoice_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invoices PRIMARY KEY,
        subscription_id INT NULL,
        membership_order_id INT NULL,
        member_id INT NOT NULL,
        receptionist_id INT NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency CHAR(3) NOT NULL CONSTRAINT DF_invoices_currency DEFAULT ('VND'),
        payment_method NVARCHAR(255) NOT NULL CONSTRAINT DF_invoices_method DEFAULT N'CASH',
        payment_status NVARCHAR(255) NOT NULL CONSTRAINT DF_invoices_status DEFAULT N'PENDING',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_invoices_created_at DEFAULT SYSDATETIME(),
        paid_at DATETIME2 NULL,
        refunded_at DATETIME2 NULL,
        CONSTRAINT FK_invoices_subscriptions FOREIGN KEY (subscription_id) REFERENCES dbo.member_subscriptions(subscription_id),
        CONSTRAINT FK_invoices_membership_orders FOREIGN KEY (membership_order_id) REFERENCES dbo.membership_orders(membership_order_id),
        CONSTRAINT FK_invoices_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_invoices_receptionists FOREIGN KEY (receptionist_id) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_invoices_amount CHECK (amount >= 0),
        CONSTRAINT CK_invoices_currency CHECK (currency = 'VND'),
        CONSTRAINT CK_invoices_method CHECK (payment_method IN (N'CASH', N'BANK_TRANSFER', N'CREDIT_CARD', N'VNPAY', N'MOMO', N'ZALOPAY', N'PAYOS')),
        CONSTRAINT CK_invoices_status CHECK (payment_status IN (N'PENDING', N'PAID', N'REFUNDED', N'CANCELLED'))
    );
END;

IF OBJECT_ID(N'dbo.payment_providers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payment_providers (
        provider_code NVARCHAR(30) NOT NULL CONSTRAINT PK_payment_providers PRIMARY KEY,
        display_name NVARCHAR(100) NOT NULL,
        is_enabled BIT NOT NULL CONSTRAINT DF_payment_providers_enabled DEFAULT (0),
        created_at DATETIME2 NOT NULL CONSTRAINT DF_payment_providers_created_at DEFAULT SYSDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.payment_transactions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.payment_transactions (
        payment_transaction_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_payment_transactions PRIMARY KEY,
        invoice_id INT NOT NULL,
        provider NVARCHAR(30) NOT NULL,
        transaction_type NVARCHAR(20) NOT NULL CONSTRAINT DF_payment_transactions_type DEFAULT N'PAYMENT',
        order_reference NVARCHAR(100) NOT NULL,
        provider_transaction_reference NVARCHAR(100) NULL,
        related_transaction_id INT NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency CHAR(3) NOT NULL CONSTRAINT DF_payment_transactions_currency DEFAULT ('VND'),
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_payment_transactions_status DEFAULT N'INITIATED',
        provider_response_code NVARCHAR(50) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_payment_transactions_created_at DEFAULT SYSDATETIME(),
        expires_at DATETIME2 NULL,
        completed_at DATETIME2 NULL,
        CONSTRAINT FK_payment_transactions_invoices FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(invoice_id),
        CONSTRAINT FK_payment_transactions_related FOREIGN KEY (related_transaction_id) REFERENCES dbo.payment_transactions(payment_transaction_id),
        CONSTRAINT UQ_payment_transactions_order_reference UNIQUE (order_reference),
        CONSTRAINT CK_payment_transactions_amount CHECK (amount > 0),
        CONSTRAINT CK_payment_transactions_currency CHECK (currency = 'VND'),
        CONSTRAINT FK_payment_transactions_provider FOREIGN KEY (provider) REFERENCES dbo.payment_providers(provider_code),
        CONSTRAINT CK_payment_transactions_type CHECK (transaction_type IN (N'PAYMENT', N'REFUND')),
        CONSTRAINT CK_payment_transactions_status CHECK (status IN (N'INITIATED', N'PENDING', N'SUCCEEDED', N'FAILED', N'EXPIRED', N'REFUND_PENDING', N'REFUNDED'))
    );
END;

IF OBJECT_ID(N'dbo.attendances', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attendances (
        attendance_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_attendances PRIMARY KEY,
        class_id INT NOT NULL,
        member_id INT NOT NULL,
        checked_in_by INT NOT NULL,
        checked_in_at DATETIME2 NOT NULL CONSTRAINT DF_attendances_checked_in_at DEFAULT SYSDATETIME(),
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_attendances_status DEFAULT N'PRESENT',
        CONSTRAINT FK_attendances_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT FK_attendances_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_attendances_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES dbo.users(user_id),
        CONSTRAINT UQ_attendances_class_member UNIQUE (class_id, member_id),
        CONSTRAINT CK_attendances_status CHECK (status IN (N'PRESENT', N'ABSENT'))
    );
END;

IF OBJECT_ID(N'dbo.feedbacks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.feedbacks (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_feedbacks PRIMARY KEY,
        from_user_id INT NOT NULL,
        to_user_id INT NULL,
        class_id INT NULL,
        rating INT NULL,
        comment NVARCHAR(MAX) NOT NULL,
        type NVARCHAR(255) NOT NULL CONSTRAINT DF_feedbacks_type DEFAULT N'MEMBER_TO_COACH',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_feedbacks_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_feedbacks_from_users FOREIGN KEY (from_user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_feedbacks_to_users FOREIGN KEY (to_user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_feedbacks_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT CK_feedbacks_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
    );
END;

IF OBJECT_ID(N'dbo.support_tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.support_tickets (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_support_tickets PRIMARY KEY,
        member_id INT NOT NULL,
        subject NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(255) NOT NULL CONSTRAINT DF_support_tickets_status DEFAULT N'OPEN',
        response NVARCHAR(MAX) NULL,
        resolved_by INT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_support_tickets_created_at DEFAULT SYSDATETIME(),
        resolved_at DATETIME2 NULL,
        CONSTRAINT FK_support_tickets_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_support_tickets_resolved_by FOREIGN KEY (resolved_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_support_tickets_status CHECK (status IN (N'OPEN', N'RESOLVED', N'CANCELLED'))
    );
END;

IF OBJECT_ID(N'dbo.workout_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_plans (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_plans PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        coach_id INT NOT NULL,
        member_id INT NULL,
        class_id INT NULL,
        description NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_workout_plans_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_workout_plans_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_plans_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_plans_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT CK_workout_plans_target CHECK (
            (member_id IS NOT NULL AND class_id IS NULL)
            OR (member_id IS NULL AND class_id IS NOT NULL)
        )
    );
END;

IF OBJECT_ID(N'dbo.workout_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_logs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_logs PRIMARY KEY,
        member_id INT NOT NULL,
        coach_id INT NOT NULL,
        schedule_id INT NULL,
        feedback_from_coach NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_workout_logs_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_workout_logs_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_logs_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_logs_classes FOREIGN KEY (schedule_id) REFERENCES dbo.classes(class_id)
    );
END;

IF OBJECT_ID(N'dbo.workout_log_details', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_log_details (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_log_details PRIMARY KEY,
        log_id INT NOT NULL,
        exercise_name NVARCHAR(255) NOT NULL,
        sets INT NULL,
        reps INT NULL,
        weight_kg DECIMAL(8,2) NULL,
        CONSTRAINT FK_workout_log_details_logs FOREIGN KEY (log_id) REFERENCES dbo.workout_logs(id) ON DELETE CASCADE,
        CONSTRAINT CK_workout_log_details_sets CHECK (sets IS NULL OR sets > 0),
        CONSTRAINT CK_workout_log_details_reps CHECK (reps IS NULL OR reps > 0),
        CONSTRAINT CK_workout_log_details_weight CHECK (weight_kg IS NULL OR weight_kg >= 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'MEMBER')
    INSERT INTO dbo.roles (role_name) VALUES (N'MEMBER');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'COACH')
    INSERT INTO dbo.roles (role_name) VALUES (N'COACH');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'RECEPTIONIST')
    INSERT INTO dbo.roles (role_name) VALUES (N'RECEPTIONIST');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'CENTER_MANAGER')
    INSERT INTO dbo.roles (role_name) VALUES (N'CENTER_MANAGER');

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
    VALUES (N'Gói STANDARD 1 tháng', 30, 500000, N'STANDARD', N'Tập các lớp tiêu chuẩn trong 30 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói STANDARD 3 tháng', 90, 1350000, N'STANDARD', N'Tập các lớp tiêu chuẩn trong 90 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 1 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói VIP 1 tháng', 30, 800000, N'VIP', N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 30 ngày.', N'ACTIVE');
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói VIP 3 tháng')
    INSERT INTO dbo.membership_packages (package_name, duration_days, price, access_level, description, status)
    VALUES (N'Gói VIP 3 tháng', 90, 2100000, N'VIP', N'Tập lớp tiêu chuẩn và lớp đặc biệt VIP trong 90 ngày.', N'ACTIVE');

IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'VNPAY')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'VNPAY', N'VNPay', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'MOMO')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'MOMO', N'MoMo', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'ZALOPAY')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'ZALOPAY', N'ZaloPay', 0);
IF NOT EXISTS (SELECT 1 FROM dbo.payment_providers WHERE provider_code = N'PAYOS')
    INSERT INTO dbo.payment_providers (provider_code, display_name, is_enabled) VALUES (N'PAYOS', N'PayOS', 0);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.classes') AND name = N'IX_classes_sport_schedule')
    CREATE INDEX IX_classes_sport_schedule ON dbo.classes (sport_id, schedule_time, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.classes') AND name = N'IX_classes_coach_schedule')
    CREATE INDEX IX_classes_coach_schedule ON dbo.classes (coach_id, schedule_time);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.class_bookings') AND name = N'IX_class_bookings_class_status')
    CREATE INDEX IX_class_bookings_class_status ON dbo.class_bookings (class_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.class_bookings') AND name = N'IX_class_bookings_member_status')
    CREATE INDEX IX_class_bookings_member_status ON dbo.class_bookings (member_id, status);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.member_subscriptions') AND name = N'IX_member_subscriptions_member_status_end')
    CREATE INDEX IX_member_subscriptions_member_status_end ON dbo.member_subscriptions (member_id, status, end_date);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'IX_invoices_member_created')
    CREATE INDEX IX_invoices_member_created ON dbo.invoices (member_id, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'IX_invoices_status_created')
    CREATE INDEX IX_invoices_status_created ON dbo.invoices (payment_status, created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'UX_invoices_subscription')
    CREATE UNIQUE INDEX UX_invoices_subscription ON dbo.invoices (subscription_id) WHERE subscription_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payment_transactions') AND name = N'UX_payment_transactions_provider_reference')
    CREATE UNIQUE INDEX UX_payment_transactions_provider_reference
        ON dbo.payment_transactions (provider_transaction_reference)
        WHERE provider_transaction_reference IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.payment_transactions') AND name = N'IX_payment_transactions_invoice_status')
    CREATE INDEX IX_payment_transactions_invoice_status ON dbo.payment_transactions (invoice_id, status, created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.invoices') AND name = N'UX_invoices_membership_order')
    CREATE UNIQUE INDEX UX_invoices_membership_order ON dbo.invoices (membership_order_id)
        WHERE membership_order_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'UX_membership_orders_bank_transaction')
    CREATE UNIQUE INDEX UX_membership_orders_bank_transaction ON dbo.membership_orders (bank_transaction_id)
        WHERE bank_transaction_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'IX_membership_orders_member_status_created')
    CREATE INDEX IX_membership_orders_member_status_created ON dbo.membership_orders (member_id, status, created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'UX_membership_orders_one_pending_per_member')
    CREATE UNIQUE INDEX UX_membership_orders_one_pending_per_member ON dbo.membership_orders (member_id)
        WHERE status = N'PENDING_PAYMENT';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.attendances') AND name = N'IX_attendances_member_time')
    CREATE INDEX IX_attendances_member_time ON dbo.attendances (member_id, checked_in_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.support_tickets') AND name = N'IX_support_tickets_status_created')
    CREATE INDEX IX_support_tickets_status_created ON dbo.support_tickets (status, created_at);

COMMIT TRANSACTION;

/* Mô tả bảng để nhóm xem trực tiếp trong SSMS (Properties > Extended Properties). */
DECLARE @TableDescriptions TABLE (TableName SYSNAME NOT NULL, Description NVARCHAR(1000) NOT NULL);
INSERT INTO @TableDescriptions (TableName, Description) VALUES
(N'roles', N'Danh mục vai trò được cấp cho tài khoản: MEMBER, COACH, RECEPTIONIST, CENTER_MANAGER.'),
(N'users', N'Tài khoản đăng nhập, thông tin liên hệ, mật khẩu BCrypt, vai trò và trạng thái hoạt động.'),
(N'member_profiles', N'Thông tin hồ sơ mở rộng riêng của hội viên; member_id đồng thời là khóa ngoại tới users.'),
(N'sports', N'Danh mục bộ môn thể thao dùng để phân loại và tạo lớp học.'),
(N'rooms', N'Danh mục phòng hoặc sân tập và sức chứa tối đa.'),
(N'membership_packages', N'Gói hội viên, thời hạn, giá bán và cấp quyền STANDARD hoặc VIP để đăng ký lớp.'),
(N'classes', N'Lịch từng buổi học, bộ môn, huấn luyện viên, phòng, sức chứa và cấp quyền yêu cầu.'),
(N'member_subscriptions', N'Kỳ sử dụng gói của hội viên cùng thời hạn và trạng thái hiệu lực.'),
(N'membership_orders', N'Yêu cầu mua/gia hạn, snapshot giá gói, idempotency và thông tin nhân viên xác nhận thanh toán.'),
(N'class_bookings', N'Đăng ký chỗ của hội viên vào một buổi học; không lưu giá vì quyền vào lớp đến từ gói hội viên.'),
(N'invoices', N'Hóa đơn của đơn gói hoặc khoản thu khác; lưu số tiền, phương thức và trạng thái thanh toán.'),
(N'payment_providers', N'Danh mục cổng thanh toán; mặc định tắt cho đến khi tích hợp thật.'),
(N'payment_transactions', N'Từng lần thanh toán/hoàn tiền qua nhà cung cấp và trạng thái phản hồi.'),
(N'attendances', N'Điểm danh hội viên theo buổi học và nhân viên ghi nhận.'),
(N'feedbacks', N'Đánh giá/nhận xét giữa hội viên, huấn luyện viên hoặc về lớp học.'),
(N'support_tickets', N'Yêu cầu hỗ trợ của hội viên và nội dung phản hồi/xử lý.'),
(N'workout_plans', N'Kế hoạch tập do huấn luyện viên tạo cho hội viên hoặc cho một lớp.'),
(N'workout_logs', N'Nhật ký buổi tập của hội viên, huấn luyện viên phụ trách và lịch liên quan.'),
(N'workout_log_details', N'Các bài tập chi tiết thuộc nhật ký: số hiệp, số lần và mức tạ.');

DECLARE @TableName SYSNAME, @Description NVARCHAR(1000);
DECLARE table_description_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT TableName, Description FROM @TableDescriptions;
OPEN table_description_cursor;
FETCH NEXT FROM table_description_cursor INTO @TableName, @Description;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF EXISTS (
        SELECT 1 FROM sys.extended_properties
        WHERE name = N'MS_Description'
          AND class = 1
          AND major_id = OBJECT_ID(N'dbo.' + QUOTENAME(@TableName))
          AND minor_id = 0
    )
        EXEC sys.sp_updateextendedproperty
            @name=N'MS_Description', @value=@Description,
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=@TableName;
    ELSE
        EXEC sys.sp_addextendedproperty
            @name=N'MS_Description', @value=@Description,
            @level0type=N'SCHEMA', @level0name=N'dbo',
            @level1type=N'TABLE', @level1name=@TableName;
    FETCH NEXT FROM table_description_cursor INTO @TableName, @Description;
END;
CLOSE table_description_cursor;
DEALLOCATE table_description_cursor;

/* Kiem tra nhanh danh muc sau khi tao database. */
SELECT role_id, role_name FROM dbo.roles ORDER BY role_id;
SELECT sport_id, sport_name, description FROM dbo.sports ORDER BY sport_id;
SELECT room_id, room_name, capacity FROM dbo.rooms ORDER BY room_id;
SELECT package_id, package_name, duration_days, price, access_level, status
FROM dbo.membership_packages ORDER BY package_id;
SELECT t.name AS table_name,
       CONVERT(NVARCHAR(1000), ep.value) AS table_description
FROM sys.tables AS t
LEFT JOIN sys.extended_properties AS ep
    ON ep.class=1 AND ep.major_id=t.object_id AND ep.minor_id=0 AND ep.name=N'MS_Description'
WHERE t.schema_id=SCHEMA_ID(N'dbo')
ORDER BY t.name;

/* Sau khi tao tai khoan COACH ACTIVE tren ung dung, co the chay sample-classes.sql de them lop mau. */
