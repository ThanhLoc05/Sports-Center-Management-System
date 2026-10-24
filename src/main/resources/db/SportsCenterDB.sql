IF DB_ID(N'SportsCenterDB') IS NULL
    CREATE DATABASE SportsCenterDB;
GO

USE SportsCenterDB;
GO

IF OBJECT_ID(N'dbo.roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.roles (
        role_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
        role_name NVARCHAR(50) NOT NULL CONSTRAINT UQ_roles_role_name UNIQUE
    );
END;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        user_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
        email NVARCHAR(255) NOT NULL CONSTRAINT UQ_users_email UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        full_name NVARCHAR(255) NOT NULL,
        phone NVARCHAR(255) NOT NULL CONSTRAINT UQ_users_phone UNIQUE,
        role_id INT NOT NULL,
        status NVARCHAR(255) NULL,
        created_at DATETIME2 NULL,
        CONSTRAINT FK_users_roles FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id)
    );
END;
GO

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
GO

IF OBJECT_ID(N'dbo.sports', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.sports (
        sport_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_sports PRIMARY KEY,
        sport_name NVARCHAR(255) NOT NULL CONSTRAINT UQ_sports_sport_name UNIQUE,
        description NVARCHAR(255) NULL
    );
END;
GO

IF OBJECT_ID(N'dbo.rooms', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.rooms (
        room_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_rooms PRIMARY KEY,
        room_name NVARCHAR(255) NOT NULL CONSTRAINT UQ_rooms_room_name UNIQUE,
        capacity INT NOT NULL,
        CONSTRAINT CK_rooms_capacity CHECK (capacity > 0)
    );
END;
GO

IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_packages (
        package_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_packages PRIMARY KEY,
        package_name NVARCHAR(255) NOT NULL,
        duration_days INT NOT NULL,
        price DECIMAL(18,2) NOT NULL,
        description NVARCHAR(255) NULL,
        status NVARCHAR(255) NULL,
        CONSTRAINT CK_membership_packages_duration CHECK (duration_days > 0),
        CONSTRAINT CK_membership_packages_price CHECK (price >= 0),
        CONSTRAINT CK_membership_packages_status CHECK (status IS NULL OR status IN ('ACTIVE', 'INACTIVE'))
    );
END;
GO

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
        status NVARCHAR(255) NULL,
        CONSTRAINT FK_classes_sports FOREIGN KEY (sport_id) REFERENCES dbo.sports(sport_id),
        CONSTRAINT FK_classes_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_classes_rooms FOREIGN KEY (room_id) REFERENCES dbo.rooms(room_id),
        CONSTRAINT CK_classes_capacity CHECK (max_capacity > 0),
        CONSTRAINT CK_classes_duration CHECK (duration_minutes > 0),
        CONSTRAINT CK_classes_status CHECK (status IS NULL OR status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED'))
    );
END;
GO

IF OBJECT_ID(N'dbo.member_subscriptions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.member_subscriptions (
        subscription_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_member_subscriptions PRIMARY KEY,
        member_id INT NOT NULL,
        package_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status NVARCHAR(255) NULL,
        CONSTRAINT FK_member_subscriptions_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_member_subscriptions_packages FOREIGN KEY (package_id) REFERENCES dbo.membership_packages(package_id),
        CONSTRAINT CK_member_subscriptions_dates CHECK (end_date >= start_date),
        CONSTRAINT CK_member_subscriptions_status
            CHECK (status IS NULL OR status IN ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED'))
    );
END;
GO

IF OBJECT_ID(N'dbo.class_bookings', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.class_bookings (
        booking_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_class_bookings PRIMARY KEY,
        class_id INT NOT NULL,
        member_id INT NOT NULL,
        booked_at DATETIME2 NULL,
        status NVARCHAR(255) NULL,
        CONSTRAINT UQ_member_class UNIQUE (class_id, member_id),
        CONSTRAINT FK_class_bookings_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT FK_class_bookings_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_class_bookings_status CHECK (status IS NULL OR status IN ('BOOKED', 'CANCELLED'))
    );
END;
GO

IF OBJECT_ID(N'dbo.attendances', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.attendances (
        attendance_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_attendances PRIMARY KEY,
        class_id INT NOT NULL,
        member_id INT NOT NULL,
        checked_in_by INT NOT NULL,
        checked_in_at DATETIME2 NULL,
        status NVARCHAR(255) NULL,
        CONSTRAINT UQ_attendance_class_member UNIQUE (class_id, member_id),
        CONSTRAINT FK_attendances_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT FK_attendances_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_attendances_checkers FOREIGN KEY (checked_in_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_attendances_status CHECK (status IS NULL OR status IN ('PRESENT', 'ABSENT'))
    );
END;
GO

IF OBJECT_ID(N'dbo.invoices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.invoices (
        invoice_id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invoices PRIMARY KEY,
        subscription_id INT NULL,
        member_id INT NOT NULL,
        receptionist_id INT NULL,
        amount DECIMAL(18,2) NOT NULL,
        payment_method NVARCHAR(255) NOT NULL,
        payment_status NVARCHAR(255) NULL,
        created_at DATETIME2 NULL,
        CONSTRAINT FK_invoices_subscriptions FOREIGN KEY (subscription_id)
            REFERENCES dbo.member_subscriptions(subscription_id),
        CONSTRAINT FK_invoices_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_invoices_receptionists FOREIGN KEY (receptionist_id) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_invoices_amount CHECK (amount > 0),
        CONSTRAINT CK_invoices_payment_method
            CHECK (payment_method IN ('CASH', 'CREDIT_CARD', 'BANK_TRANSFER', 'VNPAY')),
        CONSTRAINT CK_invoices_payment_status
            CHECK (payment_status IS NULL OR payment_status IN ('PENDING', 'PAID', 'REFUNDED'))
    );
END;
GO

IF OBJECT_ID(N'dbo.feedbacks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.feedbacks (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_feedbacks PRIMARY KEY,
        from_user_id INT NOT NULL,
        to_user_id INT NULL,
        class_id INT NULL,
        rating INT NULL,
        comment NVARCHAR(MAX) NOT NULL,
        type NVARCHAR(255) NULL,
        created_at DATETIME2 NULL,
        CONSTRAINT FK_feedbacks_from_users FOREIGN KEY (from_user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_feedbacks_to_users FOREIGN KEY (to_user_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_feedbacks_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT CK_feedbacks_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
    );
END;
GO

IF OBJECT_ID(N'dbo.support_tickets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.support_tickets (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_support_tickets PRIMARY KEY,
        member_id INT NOT NULL,
        subject NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        status NVARCHAR(255) NOT NULL,
        response NVARCHAR(MAX) NULL,
        resolved_by INT NULL,
        created_at DATETIME2 NULL,
        resolved_at DATETIME2 NULL,
        CONSTRAINT FK_support_tickets_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_support_tickets_resolvers FOREIGN KEY (resolved_by) REFERENCES dbo.users(user_id),
        CONSTRAINT CK_support_tickets_status CHECK (status IN ('OPEN', 'RESOLVED', 'CANCELLED'))
    );
END;
GO

IF OBJECT_ID(N'dbo.workout_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_plans (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_plans PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        coach_id INT NOT NULL,
        member_id INT NULL,
        class_id INT NULL,
        description NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NULL,
        CONSTRAINT FK_workout_plans_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_plans_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_plans_classes FOREIGN KEY (class_id) REFERENCES dbo.classes(class_id),
        CONSTRAINT CK_workout_plans_target CHECK (
            (member_id IS NOT NULL AND class_id IS NULL)
            OR (member_id IS NULL AND class_id IS NOT NULL)
        )
    );
END;
GO

IF OBJECT_ID(N'dbo.workout_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_logs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_logs PRIMARY KEY,
        member_id INT NOT NULL,
        coach_id INT NOT NULL,
        schedule_id INT NULL,
        feedback_from_coach NVARCHAR(MAX) NULL,
        created_at DATETIME2 NULL,
        CONSTRAINT FK_workout_logs_members FOREIGN KEY (member_id) REFERENCES dbo.users(user_id),
        CONSTRAINT FK_workout_logs_coaches FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id)
    );
END;
GO

IF OBJECT_ID(N'dbo.workout_log_details', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_log_details (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_log_details PRIMARY KEY,
        log_id INT NOT NULL,
        exercise_name NVARCHAR(255) NOT NULL,
        sets INT NULL,
        reps INT NULL,
        weight_kg DECIMAL(8,2) NULL,
        CONSTRAINT FK_workout_log_details_logs FOREIGN KEY (log_id) REFERENCES dbo.workout_logs(id),
        CONSTRAINT CK_workout_log_details_sets CHECK (sets IS NULL OR sets > 0),
        CONSTRAINT CK_workout_log_details_reps CHECK (reps IS NULL OR reps > 0),
        CONSTRAINT CK_workout_log_details_weight CHECK (weight_kg IS NULL OR weight_kg >= 0)
    );
END;
GO

