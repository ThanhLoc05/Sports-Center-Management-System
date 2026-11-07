/*
  Hồ sơ nghề nghiệp HLV, không lưu email hoặc số điện thoại trong hồ sơ công khai.
  Chạy một lần trên database đã áp dụng schema tới V6.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.coach_profiles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.coach_profiles (
        coach_id INT NOT NULL CONSTRAINT PK_coach_profiles PRIMARY KEY,
        professional_level NVARCHAR(100) NULL,
        specialties NVARCHAR(500) NULL,
        bio NVARCHAR(MAX) NULL,
        CONSTRAINT FK_coach_profiles_users FOREIGN KEY (coach_id) REFERENCES dbo.users(user_id)
    );
END;

COMMIT TRANSACTION;
