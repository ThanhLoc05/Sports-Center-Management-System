/* Lịch điểm danh demo 21/11/2026. Chỉ dùng các tài khoản và gói từ bộ seed demo. */
DECLARE @DemoDay DATETIME2 = '2026-11-21T00:00:00';
DECLARE @Now DATETIME2 = DATEADD(HOUR, 7, SYSUTCDATETIME());
DECLARE @Duration INT = 30;

IF @Now < DATEADD(DAY, -1, @DemoDay) OR @Now > DATEADD(MINUTE, 715, @DemoDay)
    RETURN;

/* Xác nhận đây là database đã nạp sample-running-data.sql. */
IF NOT EXISTS (
    SELECT 1
    FROM dbo.users AS account
    JOIN dbo.roles AS role ON role.role_id = account.role_id
    WHERE account.email = N'manager.demo@sportiva.test'
      AND role.role_name = N'CENTER_MANAGER' AND account.status = N'ACTIVE'
) OR NOT EXISTS (
    SELECT 1
    FROM dbo.membership_orders AS seed_order
    JOIN dbo.users AS member ON member.user_id = seed_order.member_id
    WHERE seed_order.idempotency_key = N'SEED-PAID-M01' AND member.email = N'member01.demo@sportiva.test'
)
    RETURN;

DECLARE @Options INT = @@OPTIONS;
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @LockResult INT;
    EXEC @LockResult = sys.sp_getapplock
        @Resource = N'Sportiva.Flow4Demo.20261121', @LockMode = 'Exclusive', @LockTimeout = 10000;
    IF @LockResult < 0
        THROW 51031, N'Không lấy được khóa nạp lớp demo Flow 4.', 1;

    DECLARE @Slots TABLE (
        slot INT PRIMARY KEY, class_name NVARCHAR(255), legacy_name NVARCHAR(255), sport_name NVARCHAR(255),
        schedule_time DATETIME2, preferred_room NVARCHAR(255)
    );
    INSERT INTO @Slots VALUES
        (1, N'Cầu lông cơ bản - Kỹ thuật giao cầu', N'DEMO Flow 4 21-11 - Cầu lông giao cầu',
            N'Cầu lông', DATEADD(MINUTE, 545, @DemoDay), N'Sân đa năng 1'),
        (2, N'Bóng rổ - Kỹ thuật ném rổ', N'DEMO Flow 4 21-11 - Bóng rổ ném rổ',
            N'Bóng rổ', DATEADD(MINUTE, 585, @DemoDay), N'Sân đa năng 2'),
        (3, N'Cầu lông cơ bản - Kỹ thuật di chuyển', N'DEMO Flow 4 21-11 - Cầu lông di chuyển',
            N'Cầu lông', DATEADD(MINUTE, 625, @DemoDay), N'Sân đa năng 1');

    /* Nhận tên cũ và các cách viết tên mới ở đúng ca học. */
    DECLARE @ExistingSlots TABLE (slot INT, class_id INT, PRIMARY KEY (slot, class_id));
    INSERT INTO @ExistingSlots (slot, class_id)
    SELECT slot.slot, existing.class_id
    FROM @Slots AS slot
    JOIN dbo.sports AS sport ON sport.sport_name = slot.sport_name
    JOIN dbo.classes AS existing WITH (UPDLOCK, HOLDLOCK) ON existing.sport_id = sport.sport_id
    WHERE existing.class_name = slot.legacy_name
       OR (
           existing.schedule_time = slot.schedule_time
           AND REPLACE(REPLACE(existing.class_name, N' ', N''), N'-', N'') COLLATE Latin1_General_100_CI_AS
               = REPLACE(REPLACE(slot.class_name, N' ', N''), N'-', N'') COLLATE Latin1_General_100_CI_AS
       );

    /* Chỉ đổi tên khi nhận diện được một lớp duy nhất cho ca. */
    UPDATE existing SET class_name = slot.class_name
    FROM dbo.classes AS existing
    JOIN @ExistingSlots AS match ON match.class_id = existing.class_id
    JOIN @Slots AS slot ON slot.slot = match.slot
    WHERE existing.class_name COLLATE Latin1_General_100_BIN2 <> slot.class_name COLLATE Latin1_General_100_BIN2
      AND NOT EXISTS (
          SELECT 1 FROM @ExistingSlots AS duplicate
          WHERE duplicate.slot = match.slot AND duplicate.class_id <> match.class_id
      );

    DELETE FROM @Slots
    WHERE slot IN (SELECT slot FROM @ExistingSlots);

    IF EXISTS (SELECT 1 FROM @Slots)
    BEGIN
        DECLARE @CoachId INT;
        SELECT TOP (1) @CoachId = coach.user_id
        FROM dbo.users AS coach
        JOIN dbo.roles AS role ON role.role_id = coach.role_id
        WHERE role.role_name = N'COACH' AND coach.status = N'ACTIVE'
          AND coach.email IN (N'coach1.demo@sportiva.test', N'coach2.demo@sportiva.test', N'coach3.demo@sportiva.test')
          AND NOT EXISTS (
              SELECT 1 FROM dbo.classes AS other
              CROSS JOIN @Slots AS slot
              WHERE other.coach_id = coach.user_id AND other.status <> N'CANCELLED'
                AND other.schedule_time < DATEADD(MINUTE, @Duration, slot.schedule_time)
                AND DATEADD(MINUTE, other.duration_minutes, other.schedule_time) > slot.schedule_time
          )
        ORDER BY coach.email;

        DECLARE @Created TABLE (class_id INT PRIMARY KEY, class_name NVARCHAR(255));
        INSERT INTO dbo.classes (
            class_name, sport_id, coach_id, room_id, max_capacity, schedule_time,
            duration_minutes, required_access_level, status
        )
        OUTPUT inserted.class_id, inserted.class_name INTO @Created
        SELECT slot.class_name, sport.sport_id, @CoachId, room.room_id, 5, slot.schedule_time,
               @Duration, N'STANDARD', N'SCHEDULED'
        FROM @Slots AS slot
        JOIN dbo.sports AS sport ON sport.sport_name = slot.sport_name
        CROSS APPLY (
            SELECT TOP (1) candidate.room_id
            FROM dbo.rooms AS candidate
            WHERE candidate.room_name IN (N'Sân đa năng 1', N'Sân đa năng 2') AND candidate.capacity >= 5
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.classes AS other
                  WHERE other.room_id = candidate.room_id AND other.status <> N'CANCELLED'
                    AND other.schedule_time < DATEADD(MINUTE, @Duration, slot.schedule_time)
                    AND DATEADD(MINUTE, other.duration_minutes, other.schedule_time) > slot.schedule_time
              )
            ORDER BY IIF(candidate.room_name = slot.preferred_room, 0, 1), candidate.room_id
        ) AS room
        WHERE @CoachId IS NOT NULL;

        IF (SELECT COUNT(*) FROM @Created) <> (SELECT COUNT(*) FROM @Slots)
            THROW 51032, N'Thiếu môn, HLV demo hoặc sân trống cho lịch Flow 4.', 1;

        DECLARE @PreferredMembers TABLE (slot INT, member_no INT, PRIMARY KEY (slot, member_no));
        INSERT INTO @PreferredMembers VALUES
            (1,1), (1,2), (1,4), (1,6), (1,11),
            (2,1), (2,12), (2,13), (2,14), (2,15),
            (3,1), (3,16), (3,17), (3,18), (3,19);

        INSERT INTO dbo.class_bookings (class_id, member_id, booked_at, status)
        SELECT created.class_id, selected.user_id,
               IIF(@Now < slot.schedule_time, @Now, DATEADD(MINUTE, -1, slot.schedule_time)), N'BOOKED'
        FROM @Created AS created
        JOIN @Slots AS slot ON slot.class_name = created.class_name
        CROSS APPLY (
            SELECT TOP (5) member.user_id
            FROM dbo.users AS member
            JOIN dbo.roles AS role ON role.role_id = member.role_id
            LEFT JOIN @PreferredMembers AS preferred ON preferred.slot = slot.slot
                AND member.email = CONCAT(N'member', RIGHT(CONCAT(N'0', preferred.member_no), 2), N'.demo@sportiva.test')
            WHERE role.role_name = N'MEMBER' AND member.status = N'ACTIVE'
              AND member.email LIKE N'member[0-9][0-9].demo@sportiva.test'
              AND EXISTS (
                  SELECT 1
                  FROM dbo.member_subscriptions AS subscription
                  WHERE subscription.member_id = member.user_id AND subscription.status = N'ACTIVE'
                    AND CONVERT(DATE, @DemoDay) BETWEEN subscription.start_date AND subscription.end_date
              )
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.class_bookings AS booking
                  JOIN dbo.classes AS other ON other.class_id = booking.class_id
                  WHERE booking.member_id = member.user_id AND booking.status = N'BOOKED'
                    AND other.status <> N'CANCELLED'
                    AND other.schedule_time < DATEADD(MINUTE, @Duration, slot.schedule_time)
                    AND DATEADD(MINUTE, other.duration_minutes, other.schedule_time) > slot.schedule_time
              )
            ORDER BY IIF(preferred.member_no IS NULL, 1, 0), member.email
        ) AS selected;

        IF @@ROWCOUNT <> 5 * (SELECT COUNT(*) FROM @Created)
            THROW 51033, N'Mỗi lớp Flow 4 cần 5 học viên demo có gói còn hạn và không trùng lịch.', 1;
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    IF (@Options & 512) = 0 SET NOCOUNT OFF;
    IF (@Options & 16384) = 0 SET XACT_ABORT OFF;
    THROW;
END CATCH;

IF (@Options & 512) = 0 SET NOCOUNT OFF;
IF (@Options & 16384) = 0 SET XACT_ABORT OFF;
