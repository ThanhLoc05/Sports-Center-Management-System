IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        email NVARCHAR(255) NOT NULL,
        password_hash NVARCHAR(255) NOT NULL,
        full_name NVARCHAR(100) NOT NULL,
        phone NVARCHAR(20) NULL,
        role NVARCHAR(20) NOT NULL,
        status NVARCHAR(20) NOT NULL CONSTRAINT DF_users_status DEFAULT 'ACTIVE',
        created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_users_email UNIQUE (email),
        CONSTRAINT CK_users_role CHECK (role IN ('MANAGER', 'COACH', 'RECEPTIONIST', 'MEMBER'))
    );
END;

IF OBJECT_ID(N'dbo.member_profiles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.member_profiles (
        user_id BIGINT NOT NULL CONSTRAINT PK_member_profiles PRIMARY KEY,
        date_of_birth DATE NULL,
        gender NVARCHAR(10) NULL,
        address NVARCHAR(500) NULL,
        fitness_goal NVARCHAR(MAX) NULL,
        emergency_contact NVARCHAR(20) NULL,
        CONSTRAINT FK_member_profiles_users FOREIGN KEY (user_id) REFERENCES dbo.users(id)
    );
END;

IF OBJECT_ID(N'dbo.memberships', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.memberships (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_memberships PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        duration_days INT NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description NVARCHAR(1000) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_memberships_active DEFAULT 1,
        CONSTRAINT CK_memberships_duration CHECK (duration_days > 0),
        CONSTRAINT CK_memberships_price CHECK (price >= 0)
    );
END;

IF OBJECT_ID(N'dbo.user_memberships', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_memberships (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_user_memberships PRIMARY KEY,
        user_id BIGINT NOT NULL,
        membership_id BIGINT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status NVARCHAR(30) NOT NULL,
        CONSTRAINT FK_user_memberships_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_user_memberships_memberships FOREIGN KEY (membership_id) REFERENCES dbo.memberships(id),
        CONSTRAINT CK_user_memberships_dates CHECK (end_date >= start_date),
        CONSTRAINT CK_user_memberships_status CHECK (status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED'))
    );
END;

IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoices (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invoices PRIMARY KEY,
        user_id BIGINT NOT NULL,
        receptionist_id BIGINT NULL,
        user_membership_id BIGINT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method NVARCHAR(30) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_invoices_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_invoices_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_invoices_receptionists FOREIGN KEY (receptionist_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_invoices_user_memberships FOREIGN KEY (user_membership_id) REFERENCES dbo.user_memberships(id),
        CONSTRAINT CK_invoices_amount CHECK (total_amount >= 0),
        CONSTRAINT CK_invoices_payment_method CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CARD'))
    );
END;

IF OBJECT_ID(N'dbo.rooms', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.rooms (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rooms PRIMARY KEY,
        name NVARCHAR(50) NOT NULL CONSTRAINT UQ_rooms_name UNIQUE,
        capacity INT NOT NULL,
        description NVARCHAR(500) NULL,
        CONSTRAINT CK_rooms_capacity CHECK (capacity > 0)
    );
END;

IF OBJECT_ID(N'dbo.classes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.classes (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_classes PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        description NVARCHAR(1000) NULL,
        max_capacity INT NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_classes_active DEFAULT 1,
        CONSTRAINT CK_classes_capacity CHECK (max_capacity > 0)
    );
END;

IF OBJECT_ID(N'dbo.class_schedules', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.class_schedules (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_class_schedules PRIMARY KEY,
        class_id BIGINT NOT NULL,
        coach_id BIGINT NOT NULL,
        room_id BIGINT NOT NULL,
        start_time DATETIME2 NOT NULL,
        end_time DATETIME2 NOT NULL,
        CONSTRAINT FK_class_schedules_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(id),
        CONSTRAINT FK_class_schedules_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_class_schedules_rooms FOREIGN KEY (room_id) REFERENCES dbo.rooms(id),
        CONSTRAINT CK_class_schedules_time CHECK (end_time > start_time)
    );
END;

IF OBJECT_ID(N'dbo.class_enrollments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.class_enrollments (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_class_enrollments PRIMARY KEY,
        user_id BIGINT NOT NULL,
        class_schedule_id BIGINT NOT NULL,
        status NVARCHAR(20) NOT NULL,
        enrolled_at DATETIME2 NOT NULL CONSTRAINT DF_class_enrollments_enrolled_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_class_enrollments_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_class_enrollments_schedules FOREIGN KEY (class_schedule_id) REFERENCES dbo.class_schedules(id),
        CONSTRAINT UQ_class_enrollments_member_schedule UNIQUE (user_id, class_schedule_id),
        CONSTRAINT CK_class_enrollments_status CHECK (status IN ('REGISTERED', 'CANCELLED'))
    );
END;

IF OBJECT_ID(N'dbo.attendances', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attendances (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_attendances PRIMARY KEY,
        user_id BIGINT NOT NULL,
        class_schedule_id BIGINT NULL,
        check_in_time DATETIME2 NOT NULL CONSTRAINT DF_attendances_check_in DEFAULT SYSDATETIME(),
        status NVARCHAR(20) NOT NULL,
        CONSTRAINT FK_attendances_users FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_attendances_schedules FOREIGN KEY (class_schedule_id) REFERENCES dbo.class_schedules(id),
        CONSTRAINT CK_attendances_status CHECK (status IN ('PRESENT', 'ABSENT'))
    );
END;

IF OBJECT_ID(N'dbo.workout_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_plans (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_plans PRIMARY KEY,
        title NVARCHAR(150) NOT NULL,
        coach_id BIGINT NOT NULL,
        member_id BIGINT NULL,
        class_id BIGINT NULL,
        description NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_workout_plans_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_workout_plans_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_workout_plans_members FOREIGN KEY (member_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_workout_plans_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(id),
        CONSTRAINT CK_workout_plans_target CHECK ((member_id IS NOT NULL AND class_id IS NULL) OR (member_id IS NULL AND class_id IS NOT NULL))
    );
END;

IF OBJECT_ID(N'dbo.workout_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_logs (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_logs PRIMARY KEY,
        member_id BIGINT NOT NULL,
        coach_id BIGINT NOT NULL,
        schedule_id BIGINT NULL,
        feedback_from_coach NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_workout_logs_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT FK_workout_logs_members FOREIGN KEY (member_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_workout_logs_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(id),
        CONSTRAINT FK_workout_logs_schedules FOREIGN KEY (schedule_id) REFERENCES dbo.class_schedules(id)
    );
END;

IF OBJECT_ID(N'dbo.workout_log_details', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_log_details (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_log_details PRIMARY KEY,
        log_id BIGINT NOT NULL,
        exercise_name NVARCHAR(150) NOT NULL,
        sets INT NULL,
        reps INT NULL,
        weight_kg DECIMAL(8,2) NULL,
        CONSTRAINT FK_workout_log_details_logs FOREIGN KEY (log_id) REFERENCES dbo.workout_logs(id),
        CONSTRAINT CK_workout_log_details_sets CHECK (sets IS NULL OR sets > 0),
        CONSTRAINT CK_workout_log_details_reps CHECK (reps IS NULL OR reps > 0),
        CONSTRAINT CK_workout_log_details_weight CHECK (weight_kg IS NULL OR weight_kg >= 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.memberships WHERE name = N'Gói ngày')
    INSERT INTO dbo.memberships (name, duration_days, price, description)
    VALUES (N'Gói ngày', 1, 100000, N'Tập luyện trong một ngày');
IF NOT EXISTS (SELECT 1 FROM dbo.memberships WHERE name = N'Gói tháng')
    INSERT INTO dbo.memberships (name, duration_days, price, description)
    VALUES (N'Gói tháng', 30, 800000, N'Tập luyện trong 30 ngày');
IF NOT EXISTS (SELECT 1 FROM dbo.memberships WHERE name = N'Gói năm')
    INSERT INTO dbo.memberships (name, duration_days, price, description)
    VALUES (N'Gói năm', 365, 8000000, N'Tập luyện trong 365 ngày');

IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE name = N'Phòng đa năng')
    INSERT INTO dbo.rooms (name, capacity, description) VALUES (N'Phòng đa năng', 20, N'Yoga và lớp nhóm');
IF NOT EXISTS (SELECT 1 FROM dbo.rooms WHERE name = N'Phòng thể lực')
    INSERT INTO dbo.rooms (name, capacity, description) VALUES (N'Phòng thể lực', 16, N'Rèn luyện thể lực');

IF NOT EXISTS (SELECT 1 FROM dbo.classes WHERE name = N'Yoga cơ bản')
    INSERT INTO dbo.classes (name, description, max_capacity) VALUES (N'Yoga cơ bản', N'Lớp Yoga dành cho người mới', 20);
IF NOT EXISTS (SELECT 1 FROM dbo.classes WHERE name = N'Rèn luyện thể lực')
    INSERT INTO dbo.classes (name, description, max_capacity) VALUES (N'Rèn luyện thể lực', N'Lớp rèn luyện thể lực nhóm', 16);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_class_schedules_start_time' AND object_id = OBJECT_ID(N'dbo.class_schedules'))
    CREATE INDEX IX_class_schedules_start_time ON dbo.class_schedules (start_time);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_invoices_created_at' AND object_id = OBJECT_ID(N'dbo.invoices'))
    CREATE INDEX IX_invoices_created_at ON dbo.invoices (created_at);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_attendances_member_time' AND object_id = OBJECT_ID(N'dbo.attendances'))
    CREATE INDEX IX_attendances_member_time ON dbo.attendances (user_id, check_in_time);
