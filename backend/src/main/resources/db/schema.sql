/*
  SportsCenterDB — tạo mới hoặc bổ sung cấu trúc thiếu cho database local cũ.
  Cập nhật 30/10/2026: đồng bộ schema với backend mới, giữ dữ liệu hiện có.
  - Chọn đúng database của dự án trong SSMS và sao lưu trước khi Execute.
  - Chỉ thêm cột/bảng thiếu; không DROP/TRUNCATE bảng, không xóa tài khoản/hóa đơn.
  - Gói và lớp cũ mặc định STANDARD, không tự suy đoán hoặc nâng thành VIP.
  - Chỉ seed gói/bộ môn/phòng mẫu khi database chưa có dữ liệu nghiệp vụ.
  - Có thể chạy lại. GO tách batch để SQL Server nhận các cột vừa thêm.
  Đây là script chạy thủ công, không được Spring Boot tự chạy.
*/
SET XACT_ABORT ON;
IF DB_NAME() IN (N'master', N'model', N'msdb', N'tempdb')
    THROW 51000, N'Hãy chọn database của dự án trước khi chạy schema.sql.', 1;
BEGIN TRANSACTION;

/* Bổ sung cột cho bảng đã tồn tại từ bản BE cũ; bảng chưa có sẽ được tạo bên dưới. */
IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NOT NULL
    AND COL_LENGTH(N'dbo.membership_packages', N'access_level') IS NULL
    ALTER TABLE dbo.membership_packages ADD access_level NVARCHAR(30) NOT NULL
        CONSTRAINT DF_membership_packages_access_level DEFAULT N'STANDARD' WITH VALUES;

IF OBJECT_ID(N'dbo.classes', N'U') IS NOT NULL
    AND COL_LENGTH(N'dbo.classes', N'required_access_level') IS NULL
    ALTER TABLE dbo.classes ADD required_access_level NVARCHAR(30) NOT NULL
        CONSTRAINT DF_classes_access_level DEFAULT N'STANDARD' WITH VALUES;

IF OBJECT_ID(N'dbo.invoices', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.invoices', N'membership_order_id') IS NULL
        ALTER TABLE dbo.invoices ADD membership_order_id INT NULL;
    IF COL_LENGTH(N'dbo.invoices', N'currency') IS NULL
        ALTER TABLE dbo.invoices ADD currency CHAR(3) NOT NULL
            CONSTRAINT DF_invoices_currency DEFAULT ('VND') WITH VALUES;
    IF COL_LENGTH(N'dbo.invoices', N'paid_at') IS NULL
        ALTER TABLE dbo.invoices ADD paid_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.invoices', N'refunded_at') IS NULL
        ALTER TABLE dbo.invoices ADD refunded_at DATETIME2 NULL;
END;
/* BE mới có @Nationalized: JDBC đọc bằng getNString nên cột VARCHAR cũ
   phải chuyển sang NVARCHAR. Chỉ mở rộng kiểu, giữ tên/ID và dữ liệu hiện có. */
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.roles') AND name = N'role_name' AND system_type_id = 167)
BEGIN
    /* Giữ lại đúng tên ràng buộc UNIQUE đang dùng, không thay khóa chính/FK role_id. */
    DECLARE @RoleNameUnique SYSNAME, @RoleNameSql NVARCHAR(MAX);
    SELECT @RoleNameUnique = kc.name
    FROM sys.key_constraints kc
    JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE kc.parent_object_id = OBJECT_ID(N'dbo.roles') AND kc.type = 'UQ'
        AND c.name = N'role_name' AND ic.key_ordinal = 1
        AND (SELECT COUNT(*) FROM sys.index_columns keys_ WHERE keys_.object_id = kc.parent_object_id
             AND keys_.index_id = kc.unique_index_id AND keys_.key_ordinal > 0) = 1;
    IF @RoleNameUnique IS NOT NULL
    BEGIN
        SET @RoleNameSql = N'ALTER TABLE dbo.roles DROP CONSTRAINT ' + QUOTENAME(@RoleNameUnique);
        EXEC sys.sp_executesql @RoleNameSql;
    END;
    ALTER TABLE dbo.roles ALTER COLUMN role_name NVARCHAR(255) NOT NULL;
    IF @RoleNameUnique IS NOT NULL
    BEGIN
        SET @RoleNameSql = N'ALTER TABLE dbo.roles ADD CONSTRAINT ' + QUOTENAME(@RoleNameUnique) + N' UNIQUE (role_name)';
        EXEC sys.sp_executesql @RoleNameSql;
    END;
END;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.rooms') AND name = N'room_name' AND system_type_id = 167)
    ALTER TABLE dbo.rooms ALTER COLUMN room_name NVARCHAR(255) NOT NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.sports') AND name = N'sport_name' AND system_type_id = 167)
    ALTER TABLE dbo.sports ALTER COLUMN sport_name NVARCHAR(255) NOT NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.sports') AND name = N'description' AND system_type_id = 167)
    ALTER TABLE dbo.sports ALTER COLUMN description NVARCHAR(255) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.member_profiles') AND name = N'gender' AND system_type_id = 167)
    ALTER TABLE dbo.member_profiles ALTER COLUMN gender NVARCHAR(255) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.member_profiles') AND name = N'address' AND system_type_id = 167)
    ALTER TABLE dbo.member_profiles ALTER COLUMN address NVARCHAR(255) NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.member_profiles') AND name = N'fitness_goals'
    AND (system_type_id = 167 OR (system_type_id = 231 AND max_length <> -1)))
    ALTER TABLE dbo.member_profiles ALTER COLUMN fitness_goals NVARCHAR(MAX) NULL;


/* Bản chụp ngân hàng chỉ bổ sung cột; đơn cũ chưa có tài khoản sẽ không tự nhận thanh toán ngân hàng. */
IF OBJECT_ID(N'dbo.membership_orders', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.membership_orders', N'payable_amount_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD payable_amount_snapshot DECIMAL(18,2) NULL;
    IF COL_LENGTH(N'dbo.membership_orders', N'demo_payment') IS NULL
        ALTER TABLE dbo.membership_orders ADD demo_payment BIT NOT NULL CONSTRAINT DF_membership_orders_demo DEFAULT (0) WITH VALUES;
    IF COL_LENGTH(N'dbo.membership_orders', N'bank_bin_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD bank_bin_snapshot VARCHAR(6) NULL;
    IF COL_LENGTH(N'dbo.membership_orders', N'bank_name_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD bank_name_snapshot NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.membership_orders', N'bank_account_no_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD bank_account_no_snapshot VARCHAR(19) NULL;
    IF COL_LENGTH(N'dbo.membership_orders', N'bank_account_name_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD bank_account_name_snapshot NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.membership_orders', N'bank_gateway_snapshot') IS NULL
        ALTER TABLE dbo.membership_orders ADD bank_gateway_snapshot VARCHAR(100) NULL;
END;

/* Giữ transaction qua batch; không COMMIT riêng các cột trước phần tạo bảng. */
GO
/* Dừng nếu batch bổ sung cột phía trên chưa mở/giữ được transaction. */
IF @@TRANCOUNT = 0 OR XACT_STATE() <> 1
    THROW 51001, N'Batch cập nhật cấu trúc trước đó chưa thành công; không chạy tiếp.', 1;

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
        fitness_goals NVARCHAR(MAX) NULL,
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
        request_fingerprint VARCHAR(64) NOT NULL,
        created_by INT NOT NULL,
        confirmed_by INT NULL,
        bank_transaction_id NVARCHAR(100) NULL,
        confirmation_key NVARCHAR(100) NULL,
        confirmation_fingerprint VARCHAR(64) NULL,
        payable_amount_snapshot DECIMAL(18,2) NULL,
        demo_payment BIT NOT NULL CONSTRAINT DF_membership_orders_demo DEFAULT (0),
        bank_bin_snapshot VARCHAR(6) NULL,
        bank_name_snapshot NVARCHAR(100) NULL,
        bank_account_no_snapshot VARCHAR(19) NULL,
        bank_account_name_snapshot NVARCHAR(100) NULL,
        bank_gateway_snapshot VARCHAR(100) NULL,
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

/* Thanh toán thật: cấu hình dùng chung, giao dịch đã xác thực và thông báo trên website.
   Không seed STK cá nhân, API key hoặc tài khoản email vào Git/database. */
/* TẠO MỚI: cấu hình nhận tiền chung, chỉ một bản ghi ID=1 và có version chống ghi đè. */
IF OBJECT_ID(N'dbo.center_bank_account', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.center_bank_account (
        id INT NOT NULL CONSTRAINT PK_center_bank_account PRIMARY KEY,
        bank_bin VARCHAR(6) NOT NULL,
        bank_name NVARCHAR(100) NOT NULL,
        account_no VARCHAR(19) NOT NULL,
        account_name NVARCHAR(100) NOT NULL,
        gateway_name VARCHAR(100) NOT NULL,
        enabled BIT NOT NULL,
        version INT NOT NULL CONSTRAINT DF_center_bank_account_version DEFAULT (0),
        updated_at DATETIME2 NOT NULL,
        CONSTRAINT CK_center_bank_account_singleton CHECK (id = 1)
    );
END;
/* TẠO MỚI: sổ giao dịch ngân hàng đã xác thực; provider_event_id duy nhất chống cộng tiền lặp. */
IF OBJECT_ID(N'dbo.bank_payment_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.bank_payment_events (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_bank_payment_events PRIMARY KEY,
        provider_event_id BIGINT NOT NULL CONSTRAINT UQ_bank_payment_events_provider UNIQUE,
        invoice_id INT NOT NULL,
        payload_fingerprint VARCHAR(64) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        transfer_content NVARCHAR(1000) NOT NULL,
        bank_reference VARCHAR(100) NULL,
        transaction_at DATETIME2 NOT NULL,
        received_at DATETIME2 NOT NULL,
        status VARCHAR(30) NOT NULL,
        CONSTRAINT FK_bank_payment_events_invoice FOREIGN KEY (invoice_id) REFERENCES dbo.invoices(invoice_id),
        CONSTRAINT CK_bank_payment_events_amount CHECK (amount > 0),
        CONSTRAINT CK_bank_payment_events_status CHECK (status IN ('RECEIVED', 'APPLIED', 'REVIEW_REQUIRED'))
    );
END;
/* Thông báo trên website: một bản ghi cho một đơn đã hoàn thành. */
/* TẠO MỚI: thông báo xác nhận trong website, unique order_id để retry không tạo nhiều thông báo. */
IF OBJECT_ID(N'dbo.membership_notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_notifications (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_notifications PRIMARY KEY,
        order_id INT NOT NULL CONSTRAINT UQ_membership_notifications_order UNIQUE,
        member_id INT NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL,
        CONSTRAINT FK_membership_notifications_order FOREIGN KEY (order_id) REFERENCES dbo.membership_orders(membership_order_id),
        CONSTRAINT FK_membership_notifications_member FOREIGN KEY (member_id) REFERENCES dbo.users(user_id)
    );
END;
/* Giữ các thông báo đã có ở bản cấu trúc trước; không xóa dữ liệu lịch sử. */
IF OBJECT_ID(N'dbo.membership_messages', N'U') IS NOT NULL
    EXEC(N'INSERT dbo.membership_notifications(order_id, member_id, content, created_at)
        SELECT m.order_id, m.member_id, m.body, m.notification_sent_at
        FROM dbo.membership_messages m
        WHERE NOT EXISTS (SELECT 1 FROM dbo.membership_notifications n WHERE n.order_id = m.order_id)');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.bank_payment_events') AND name = N'IX_bank_payment_events_invoice')
    CREATE INDEX IX_bank_payment_events_invoice ON dbo.bank_payment_events(invoice_id, status) INCLUDE (amount);


IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'MEMBER')
    INSERT INTO dbo.roles (role_name) VALUES (N'MEMBER');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'COACH')
    INSERT INTO dbo.roles (role_name) VALUES (N'COACH');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'RECEPTIONIST')
    INSERT INTO dbo.roles (role_name) VALUES (N'RECEPTIONIST');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_name = N'CENTER_MANAGER')
    INSERT INTO dbo.roles (role_name) VALUES (N'CENTER_MANAGER');

/* Database đang dùng: không tự thêm gói/phòng/bộ môn mẫu khi nâng cấp cấu trúc. */
IF NOT EXISTS (SELECT 1 FROM dbo.users)
    AND NOT EXISTS (SELECT 1 FROM dbo.membership_packages)
    AND NOT EXISTS (SELECT 1 FROM dbo.classes)
    AND NOT EXISTS (SELECT 1 FROM dbo.sports)
    AND NOT EXISTS (SELECT 1 FROM dbo.rooms)
BEGIN
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

END;

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


/* Entity MembershipOrder dùng String: VARCHAR(64), không phải CHAR(64).
   Chuyển đúng kiểu cho DB đã chạy schema/V6 cũ; giữ nguyên nội dung hash. */
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'request_fingerprint' AND system_type_id = 175)
    ALTER TABLE dbo.membership_orders ALTER COLUMN request_fingerprint VARCHAR(64) NOT NULL;
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.membership_orders') AND name = N'confirmation_fingerprint' AND system_type_id = 175)
    ALTER TABLE dbo.membership_orders ALTER COLUMN confirmation_fingerprint VARCHAR(64) NULL;
/* Ràng buộc cho cột vừa thêm ở DB cũ. Tạo bảng mới ở trên đã có các ràng buộc này. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_membership_packages_access_level' AND parent_object_id = OBJECT_ID(N'dbo.membership_packages'))
    ALTER TABLE dbo.membership_packages WITH CHECK ADD CONSTRAINT CK_membership_packages_access_level
        CHECK (access_level IN (N'STANDARD', N'VIP'));
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_classes_access_level' AND parent_object_id = OBJECT_ID(N'dbo.classes'))
    ALTER TABLE dbo.classes WITH CHECK ADD CONSTRAINT CK_classes_access_level
        CHECK (required_access_level IN (N'STANDARD', N'VIP'));
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_invoices_membership_orders' AND parent_object_id = OBJECT_ID(N'dbo.invoices'))
    ALTER TABLE dbo.invoices WITH CHECK ADD CONSTRAINT FK_invoices_membership_orders
        FOREIGN KEY (membership_order_id) REFERENCES dbo.membership_orders(membership_order_id);

COMMIT TRANSACTION;
