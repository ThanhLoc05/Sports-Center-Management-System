/* Existing classes remain dated training sessions. No historical rows are deleted. */
SET XACT_ABORT ON;
IF OBJECT_ID(N'dbo.membership_packages', N'U') IS NULL
    THROW 51000, N'Chọn đúng database dự án và áp dụng V18 trước V19.', 1;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.regular_classes', N'U') IS NULL
CREATE TABLE dbo.regular_classes (
    id INT IDENTITY PRIMARY KEY,
    name NVARCHAR(150) NOT NULL,
    sport_id INT NOT NULL REFERENCES dbo.sports(sport_id),
    description NVARCHAR(2000) NULL,
    training_level NVARCHAR(100) NOT NULL DEFAULT N'Người mới',
    max_capacity INT NOT NULL CHECK (max_capacity > 0),
    required_access_level NVARCHAR(30) NOT NULL CHECK (required_access_level IN (N'STANDARD',N'VIP')),
    status NVARCHAR(30) NOT NULL DEFAULT N'ACTIVE' CHECK (status IN (N'ACTIVE',N'PAUSED',N'CANCELLED')),
    created_by INT NOT NULL REFERENCES dbo.users(user_id),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
IF OBJECT_ID(N'dbo.courses', N'U') IS NULL
CREATE TABLE dbo.courses (
    id INT IDENTITY PRIMARY KEY,
    name NVARCHAR(150) NOT NULL,
    sport_id INT NOT NULL REFERENCES dbo.sports(sport_id),
    description NVARCHAR(2000) NULL,
    training_level NVARCHAR(100) NOT NULL DEFAULT N'Người mới',
    max_capacity INT NOT NULL CHECK (max_capacity > 0),
    required_access_level NVARCHAR(30) NOT NULL CHECK (required_access_level IN (N'STANDARD',N'VIP')),
    total_sessions INT NOT NULL CHECK (total_sessions BETWEEN 1 AND 520),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    price DECIMAL(18,2) NOT NULL CHECK (price > 0),
    discount_eligible BIT NOT NULL DEFAULT 1,
    status NVARCHAR(30) NOT NULL DEFAULT N'OPEN' CHECK (status IN (N'OPEN',N'ONGOING',N'COMPLETED',N'CANCELLED')),
    created_by INT NOT NULL REFERENCES dbo.users(user_id),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    CHECK (end_date >= start_date)
);
IF OBJECT_ID(N'dbo.training_slots', N'U') IS NULL
CREATE TABLE dbo.training_slots (
    id INT IDENTITY PRIMARY KEY,
    regular_class_id INT NULL REFERENCES dbo.regular_classes(id),
    course_id INT NULL REFERENCES dbo.courses(id),
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time TIME(0) NOT NULL,
    end_time TIME(0) NOT NULL,
    coach_id INT NOT NULL REFERENCES dbo.users(user_id),
    room_id INT NOT NULL REFERENCES dbo.rooms(room_id),
    CHECK (end_time > start_time),
    CHECK ((regular_class_id IS NOT NULL AND course_id IS NULL) OR (regular_class_id IS NULL AND course_id IS NOT NULL))
);
IF OBJECT_ID(N'dbo.regular_class_registrations', N'U') IS NULL
CREATE TABLE dbo.regular_class_registrations (
    id INT IDENTITY PRIMARY KEY,
    regular_class_id INT NOT NULL REFERENCES dbo.regular_classes(id),
    member_id INT NOT NULL REFERENCES dbo.users(user_id),
    subscription_id INT NOT NULL REFERENCES dbo.member_subscriptions(subscription_id),
    valid_from DATE NOT NULL,
    valid_until DATE NOT NULL,
    status NVARCHAR(30) NOT NULL DEFAULT N'ACTIVE' CHECK (status IN (N'ACTIVE',N'CANCELLED',N'EXPIRED')),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    UNIQUE (regular_class_id,member_id,subscription_id),
    CHECK (valid_until >= valid_from)
);
IF OBJECT_ID(N'dbo.membership_sports', N'U') IS NULL
CREATE TABLE dbo.membership_sports (
    subscription_id INT NOT NULL REFERENCES dbo.member_subscriptions(subscription_id),
    sport_id INT NOT NULL REFERENCES dbo.sports(sport_id),
    selected_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    PRIMARY KEY (subscription_id,sport_id)
);
IF OBJECT_ID(N'dbo.course_orders', N'U') IS NULL
CREATE TABLE dbo.course_orders (
    id INT IDENTITY PRIMARY KEY,
    course_id INT NOT NULL REFERENCES dbo.courses(id),
    member_id INT NOT NULL REFERENCES dbo.users(user_id),
    subscription_id INT NOT NULL REFERENCES dbo.member_subscriptions(subscription_id),
    course_name_snapshot NVARCHAR(150) NOT NULL,
    list_price DECIMAL(18,2) NOT NULL CHECK (list_price > 0),
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 0 AND 100),
    amount DECIMAL(18,2) NOT NULL CHECK (amount >= 0),
    payment_method NVARCHAR(30) NOT NULL CHECK (payment_method IN (N'CASH',N'BANK_TRANSFER')),
    status NVARCHAR(30) NOT NULL DEFAULT N'PENDING_PAYMENT' CHECK (status IN (N'PENDING_PAYMENT',N'CONFIRMED',N'CANCELLED',N'EXPIRED',N'REFUNDED')),
    idempotency_key NVARCHAR(100) NOT NULL,
    request_fingerprint VARCHAR(64) NOT NULL,
    created_by INT NOT NULL REFERENCES dbo.users(user_id),
    confirmed_by INT NULL REFERENCES dbo.users(user_id),
    bank_transaction_id NVARCHAR(100) NULL,
    bank_bin_snapshot VARCHAR(6) NULL,
    bank_name_snapshot NVARCHAR(100) NULL,
    bank_account_no_snapshot VARCHAR(19) NULL,
    bank_account_name_snapshot NVARCHAR(100) NULL,
    bank_gateway_snapshot NVARCHAR(100) NULL,
    version INT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL,
    expires_at DATETIME2 NOT NULL,
    confirmed_at DATETIME2 NULL,
    UNIQUE (created_by,idempotency_key)
);
IF COL_LENGTH(N'dbo.classes',N'regular_class_id') IS NULL
    ALTER TABLE dbo.classes ADD regular_class_id INT NULL REFERENCES dbo.regular_classes(id);
IF COL_LENGTH(N'dbo.classes',N'course_id') IS NULL
    ALTER TABLE dbo.classes ADD course_id INT NULL REFERENCES dbo.courses(id);
IF COL_LENGTH(N'dbo.classes',N'program_suspended') IS NULL
    ALTER TABLE dbo.classes ADD program_suspended BIT NOT NULL CONSTRAINT DF_classes_program_suspended DEFAULT (0);
IF COL_LENGTH(N'dbo.classes',N'planned_time') IS NULL
    ALTER TABLE dbo.classes ADD planned_time DATETIME2 NULL;
IF COL_LENGTH(N'dbo.invoices',N'course_order_id') IS NULL
    ALTER TABLE dbo.invoices ADD course_order_id INT NULL REFERENCES dbo.course_orders(id);
COMMIT TRANSACTION;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.classes') AND name=N'UX_classes_regular_planned')
    CREATE UNIQUE INDEX UX_classes_regular_planned ON dbo.classes(regular_class_id,planned_time) WHERE regular_class_id IS NOT NULL AND planned_time IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.classes') AND name=N'UX_classes_course_planned')
    CREATE UNIQUE INDEX UX_classes_course_planned ON dbo.classes(course_id,planned_time) WHERE course_id IS NOT NULL AND planned_time IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.classes') AND name=N'UX_classes_regular_session')
    CREATE UNIQUE INDEX UX_classes_regular_session ON dbo.classes(regular_class_id,schedule_time) WHERE regular_class_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.classes') AND name=N'UX_classes_course_session')
    CREATE UNIQUE INDEX UX_classes_course_session ON dbo.classes(course_id,schedule_time) WHERE course_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.invoices') AND name=N'UX_invoices_course_order')
    CREATE UNIQUE INDEX UX_invoices_course_order ON dbo.invoices(course_order_id) WHERE course_order_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.classes') AND name=N'CK_classes_training_owner')
    ALTER TABLE dbo.classes ADD CONSTRAINT CK_classes_training_owner CHECK (regular_class_id IS NULL OR course_id IS NULL);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.invoices') AND name=N'CK_invoices_order_owner')
    ALTER TABLE dbo.invoices ADD CONSTRAINT CK_invoices_order_owner CHECK (membership_order_id IS NULL OR course_order_id IS NULL);
GO
