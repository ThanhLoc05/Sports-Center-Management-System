/*
  Du lieu mau lop hoc cho SQL Server 2019.

  Cach chay:
  1. Chay schema.sql tren database SportsCenterDB.
  2. Tao it nhat mot tai khoan COACH trong ung dung.
  3. Chay file nay trong database SportsCenterDB.

  Script co the chay lai: khong tao trung bo mon, phong hoc hoac lop mau.
  Cac lop mau duoc xep vao cac ngay lien tiep, bat dau tu ngay mai.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

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

DECLARE @CoachId INT;
SELECT TOP (1) @CoachId = u.user_id
FROM dbo.users AS u
JOIN dbo.roles AS r ON r.role_id = u.role_id
WHERE r.role_name = N'COACH' AND u.status = N'ACTIVE'
ORDER BY u.user_id;

IF @CoachId IS NULL
    THROW 50001, N'Chua co tai khoan COACH ACTIVE. Hay tao tai khoan huan luyen vien trong ung dung roi chay lai script.', 1;

DECLARE @Tomorrow DATE = DATEADD(DAY, 1, CONVERT(DATE, SYSDATETIME()));

/* Moi lop mau dung mot ngay rieng de khong trung lich cua cung huan luyen vien. */
INSERT INTO dbo.classes
    (class_name, sport_id, coach_id, room_id, max_capacity, schedule_time, duration_minutes, required_access_level, status)
SELECT
    sample.class_name,
    sport.sport_id,
    @CoachId,
    room.room_id,
    sample.max_capacity,
    DATEADD(MINUTE, sample.start_minute, CONVERT(DATETIME2, DATEADD(DAY, sample.day_offset, @Tomorrow))),
    sample.duration_minutes,
    sample.required_access_level,
    N'SCHEDULED'
FROM (VALUES
    (N'Cầu lông cơ bản', N'Cầu lông', N'Sân đa năng 1', 0, 540, 16, 60, N'STANDARD'),
    (N'Bóng rổ nhập môn', N'Bóng rổ', N'Sân đa năng 2', 1, 600, 18, 60, N'STANDARD'),
    (N'Bơi căn bản', N'Bơi lội', N'Hồ bơi', 2, 480, 10, 60, N'STANDARD'),
    (N'Yoga thư giãn', N'Yoga', N'Phòng tập nhóm', 3, 450, 14, 60, N'STANDARD'),
    (N'Fitness cá nhân hóa VIP', N'Fitness', N'Phòng tập nhóm', 4, 660, 10, 60, N'VIP'),
    (N'Boxing nâng cao VIP', N'Boxing', N'Sân đa năng 1', 5, 720, 12, 60, N'VIP')
) AS sample(class_name, sport_name, room_name, day_offset, start_minute, max_capacity, duration_minutes, required_access_level)
JOIN dbo.sports AS sport ON sport.sport_name = sample.sport_name
JOIN dbo.rooms AS room ON room.room_name = sample.room_name
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.classes AS existing_class WHERE existing_class.class_name = sample.class_name
);

COMMIT TRANSACTION;

/* Kiem tra nhanh ket qua seed. */
SELECT c.class_id, c.class_name, s.sport_name, u.full_name AS coach_name,
       r.room_name, c.schedule_time, c.max_capacity, c.required_access_level, c.status
FROM dbo.classes AS c
JOIN dbo.sports AS s ON s.sport_id = c.sport_id
JOIN dbo.users AS u ON u.user_id = c.coach_id
JOIN dbo.rooms AS r ON r.room_id = c.room_id
WHERE c.class_name IN (
    N'Cầu lông cơ bản', N'Bóng rổ nhập môn', N'Bơi căn bản',
    N'Yoga thư giãn', N'Fitness cá nhân hóa VIP', N'Boxing nâng cao VIP'
)
ORDER BY c.schedule_time;
