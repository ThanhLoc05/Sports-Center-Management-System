SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.attendances', 'vip_towel_at') IS NULL
    ALTER TABLE dbo.attendances ADD vip_towel_at DATETIME2 NULL;
IF COL_LENGTH('dbo.attendances', 'vip_water_at') IS NULL
    ALTER TABLE dbo.attendances ADD vip_water_at DATETIME2 NULL;
IF COL_LENGTH('dbo.attendances', 'vip_supplies_by') IS NULL
    ALTER TABLE dbo.attendances ADD vip_supplies_by INT NULL
        CONSTRAINT FK_attendance_vip_supplies_by REFERENCES dbo.users(user_id);

COMMIT TRANSACTION;
