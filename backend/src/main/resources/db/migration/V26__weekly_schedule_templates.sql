-- Weekly schedule templates are independent of published sessions and their bookings.
SET XACT_ABORT ON;
IF DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb') THROW 51000, N'Use a Sportiva database.', 1;
IF COL_LENGTH(N'dbo.classes', N'course_id') IS NULL
   OR OBJECT_ID(N'dbo.recurring_class_sessions', N'U') IS NULL
   THROW 51000, N'Apply the approved integrated schema first.', 1;
IF OBJECT_ID(N'dbo.weekly_schedule_templates', N'U') IS NOT NULL
   OR OBJECT_ID(N'dbo.weekly_schedule_template_entries', N'U') IS NOT NULL
   THROW 51000, N'Template tables already exist; inspect before proceeding.', 1;
BEGIN TRANSACTION;

CREATE TABLE dbo.weekly_schedule_templates (
    template_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_weekly_schedule_templates PRIMARY KEY,
    template_name nvarchar(150) NOT NULL CONSTRAINT UQ_weekly_schedule_templates_name UNIQUE,
    version bigint NOT NULL CONSTRAINT DF_weekly_schedule_templates_version DEFAULT (0),
    saved_by int NOT NULL CONSTRAINT FK_weekly_schedule_templates_user REFERENCES dbo.users(user_id),
    saved_at datetime2(3) NOT NULL CONSTRAINT DF_weekly_schedule_templates_saved_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_weekly_schedule_templates_version CHECK (version >= 0)
);

CREATE TABLE dbo.weekly_schedule_template_entries (
    entry_id int IDENTITY(1,1) NOT NULL CONSTRAINT PK_weekly_schedule_template_entries PRIMARY KEY,
    template_id int NOT NULL CONSTRAINT FK_weekly_schedule_template_entries_template REFERENCES dbo.weekly_schedule_templates(template_id),
    day_of_week tinyint NOT NULL CONSTRAINT CK_weekly_schedule_template_entries_day CHECK (day_of_week BETWEEN 1 AND 7),
    slot_number tinyint NOT NULL CONSTRAINT CK_weekly_schedule_template_entries_slot CHECK (slot_number BETWEEN 1 AND 6),
    class_name nvarchar(150) NOT NULL,
    sport_id int NOT NULL CONSTRAINT FK_weekly_schedule_template_entries_sport REFERENCES dbo.sports(sport_id),
    coach_id int NOT NULL CONSTRAINT FK_weekly_schedule_template_entries_coach REFERENCES dbo.users(user_id),
    room_id int NOT NULL CONSTRAINT FK_weekly_schedule_template_entries_room REFERENCES dbo.rooms(room_id),
    max_capacity int NOT NULL CONSTRAINT CK_weekly_schedule_template_entries_capacity CHECK (max_capacity > 0),
    required_access_level nvarchar(30) NOT NULL CONSTRAINT CK_weekly_schedule_template_entries_level CHECK (required_access_level IN (N'STANDARD',N'VIP')),
    CONSTRAINT UQ_weekly_schedule_template_entries_coach UNIQUE (template_id, day_of_week, slot_number, coach_id),
    CONSTRAINT UQ_weekly_schedule_template_entries_room UNIQUE (template_id, day_of_week, slot_number, room_id)
);

COMMIT;
