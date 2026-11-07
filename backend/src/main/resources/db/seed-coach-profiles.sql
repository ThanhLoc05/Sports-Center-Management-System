/*
  Idempotently seed fictional, polished demo profiles for the four sample coaches.
  Experience and qualifications are fabricated for demonstration, not verification.
  Other existing coach profiles are left untouched.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.coach_profiles', N'U') IS NULL
    THROW 51010, N'Run schema.sql or migration V7 before seeding coach profiles.', 1;

DECLARE @DemoCoachProfiles TABLE (
    email NVARCHAR(255) PRIMARY KEY,
    professional_level NVARCHAR(100),
    specialties NVARCHAR(500),
    bio NVARCHAR(4000)
);

INSERT INTO @DemoCoachProfiles (email, professional_level, specialties, bio) VALUES
(
    N'coach1.demo@sportiva.test',
    N'HLV trưởng bộ môn | Cầu lông & Bóng rổ',
    N'Cầu lông nâng cao, bóng rổ nền tảng, kỹ thuật di chuyển, huấn luyện nhóm',
    N'Hồ sơ và thành tích là dữ liệu giả lập phục vụ demo. HLV trưởng bộ môn tại Sportiva Performance Center với 8 năm kinh nghiệm mô phỏng; sở trường xây dựng giáo án cầu lông và bóng rổ theo cấp độ. Có chứng nhận huấn luyện cầu lông cấp II và sơ cứu thể thao (đều là thông tin giả lập). Giáo án chú trọng kỹ thuật chuẩn, thể lực nền, theo dõi tiến độ và phản hồi riêng cho từng học viên.'
),
(
    N'coach2.demo@sportiva.test',
    N'HLV trưởng | Yoga & Fitness',
    N'Yoga phục hồi, strength training, mobility, xây dựng thói quen vận động',
    N'Hồ sơ và thành tích là dữ liệu giả lập phục vụ demo. HLV tại Sportiva Performance Center với 7 năm kinh nghiệm mô phỏng, kết hợp yoga phục hồi và rèn luyện sức mạnh. Hồ sơ demo gồm chứng nhận hướng dẫn Yoga 200 giờ và huấn luyện thể lực (thông tin giả lập). Mỗi chương trình có đánh giá đầu vào, lựa chọn mức độ bài tập và mục tiêu tiến bộ rõ ràng; ưu tiên kỹ thuật, khả năng vận động và sự an toàn.'
),
(
    N'coach3.demo@sportiva.test',
    N'HLV chuyên sâu | Bơi lội',
    N'Bơi sải, bơi ếch, kỹ năng an toàn dưới nước, hướng dẫn người mới',
    N'Hồ sơ và thành tích là dữ liệu giả lập phục vụ demo. HLV bơi lội tại Sportiva Performance Center với 9 năm kinh nghiệm mô phỏng, chuyên hướng dẫn từ làm quen nước đến hoàn thiện kỹ thuật bơi sải và bơi ếch. Hồ sơ demo gồm chứng nhận huấn luyện bơi và cứu hộ hồ bơi nội bộ (thông tin giả lập). Lộ trình học chia theo mục tiêu, theo sát từng học viên và đặt an toàn dưới nước lên hàng đầu.'
),
(
    N'coach.demo@sportiva.com',
    N'HLV cá nhân cấp cao | Thể lực',
    N'Personal training, sức mạnh, sức bền, thiết kế chương trình cá nhân',
    N'Hồ sơ và thành tích là dữ liệu giả lập phục vụ demo. HLV cá nhân tại Sportiva Performance Center với 8 năm kinh nghiệm mô phỏng, chuyên thiết kế chương trình sức mạnh và sức bền theo mục tiêu. Hồ sơ demo gồm chứng nhận huấn luyện viên thể lực cá nhân và đánh giá vận động cơ bản (thông tin giả lập). Tài khoản chưa được phân công lớp trong dữ liệu hiện tại; trung tâm có thể dùng hồ sơ này để minh họa quy trình tư vấn và xếp lịch.'
);

UPDATE profile
SET profile.professional_level = seed.professional_level,
    profile.specialties = seed.specialties,
    profile.bio = seed.bio
FROM dbo.coach_profiles AS profile
JOIN dbo.users AS coach ON coach.user_id = profile.coach_id
JOIN dbo.roles AS role ON role.role_id = coach.role_id AND role.role_name = N'COACH'
JOIN @DemoCoachProfiles AS seed ON seed.email = coach.email;

INSERT INTO dbo.coach_profiles (coach_id, professional_level, specialties, bio)
SELECT coach.user_id, seed.professional_level, seed.specialties, seed.bio
FROM dbo.users AS coach
JOIN dbo.roles AS role ON role.role_id = coach.role_id AND role.role_name = N'COACH'
JOIN @DemoCoachProfiles AS seed ON seed.email = coach.email
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.coach_profiles AS existing
    WHERE existing.coach_id = coach.user_id
);

INSERT INTO dbo.coach_profiles (coach_id, professional_level, specialties, bio)
SELECT coach.user_id,
       NULL,
       COALESCE(summary.specialties, N'Chưa có lớp được phân công'),
       CASE
           WHEN summary.specialties IS NULL
               THEN N'Chưa có thông tin giới thiệu. Trung tâm cần cập nhật hồ sơ HLV.'
           ELSE N'Chuyên môn được suy ra từ bộ môn lớp đang phụ trách: '
               + summary.specialties + N'. Vui lòng bổ sung phần giới thiệu và trình độ đã xác minh.'
       END
FROM dbo.users AS coach
JOIN dbo.roles AS role ON role.role_id = coach.role_id AND role.role_name = N'COACH'
LEFT JOIN (
    SELECT coach_id, STRING_AGG(sport_name, N', ') AS specialties
    FROM (
        SELECT DISTINCT c.coach_id, s.sport_name
        FROM dbo.classes AS c
        JOIN dbo.sports AS s ON s.sport_id = c.sport_id
    ) AS coach_sports
    GROUP BY coach_id
) AS summary ON summary.coach_id = coach.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.coach_profiles AS existing
    WHERE existing.coach_id = coach.user_id
);

COMMIT TRANSACTION;
