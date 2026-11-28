/*
  V29 - Nạp tài khoản demo, gói tập và mẫu lịch tuần chuẩn vào DB dự án.
  Cái gì: lấy cùng dữ liệu với db/demo/V28__standardize_demo_data.sql (3 bộ môn, 6 phòng, 31 tài khoản,
          gói tập của hội viên, mẫu lịch "Lịch tập tiêu chuẩn Sportiva").
  Làm sao: chạy tay trên SportsCenterDB sau V28. Mỗi INSERT đều có NOT EXISTS nên chạy lại không bị trùng.
          Tài khoản demo mới dùng chung mật khẩu với tài khoản nguồn (@passwordSourceEmail) - không lưu mã băm trong repo.
  Tại sao: bản demo/V28 chỉ chạy qua backend profile demo trên DB SportivaDemo_*; bản này để nhóm có cùng dữ liệu demo trên DB chính.
  Lưu ý: file này KHÔNG tạo buổi tập. Sau khi chạy, đăng nhập quản lý -> Lớp học -> Lịch tuần -> đồng bộ lịch để sinh buổi tập
          (mã chuỗi lịch recurrence_key do backend tính, không tạo bằng SQL).
  Gói tập chỉ được thêm khi hôm nay nằm trong khoảng ngày của gói; gói VIP chỉ thêm khi gói VIP còn ACTIVE.
  Chạy bằng sqlcmd phải thêm cờ -I (bật QUOTED_IDENTIFIER, cần cho index lọc của dbo.users); SSMS đã bật sẵn.
*/
SET XACT_ABORT ON;
SET NOCOUNT ON;
IF OBJECT_ID(N'dbo.weekly_schedule_template_entries', N'U') IS NULL
    THROW 51000, N'Áp dụng V26 (mẫu lịch tuần) trước V29 trên đúng database dự án.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.membership_packages WHERE package_name = N'Gói STANDARD 1 tháng')
    THROW 51000, N'Áp dụng V27 (gói combo) trước V29.', 1;

-- Đổi email này nếu muốn tài khoản demo dùng mật khẩu của tài khoản khác đang có trong DB.
DECLARE @passwordSourceEmail nvarchar(255) = N'reception.demo@sportiva.test';
DECLARE @password_hash nvarchar(255) = COALESCE(
    (SELECT password_hash FROM dbo.users WHERE email = @passwordSourceEmail),
    (SELECT password_hash FROM dbo.users WHERE email = N'manager.demo@sportiva.test'));
IF @password_hash IS NULL
    THROW 51000, N'Không tìm thấy tài khoản nguồn để lấy mật khẩu. Sửa @passwordSourceEmail thành một email đang có trong dbo.users.', 1;

BEGIN TRY
BEGIN TRANSACTION;
DECLARE @data nvarchar(max) = N'{"sports":[{"name":"Cầu lông"},{"name":"Yoga"},{"name":"Dance"}],"rooms":[{"name":"Sân cầu lông 01 – Smash","capacity":8},{"name":"Sân cầu lông 02 – Rally","capacity":8},{"name":"Phòng Yoga 01 – Balance","capacity":15},{"name":"Phòng Yoga 02 – Harmony","capacity":12},{"name":"Phòng Dance 01 – Rhythm","capacity":15},{"name":"Phòng Dance 02 – Flow","capacity":12}],"accounts":[{"email":"standard.demo@sportiva.test","role":"MEMBER","n":1},{"email":"expired@sportiva.demo","role":"MEMBER","n":2},{"email":"phong.le@sportiva.demo","role":"MEMBER","n":3},{"email":"khanh.pham@sportiva.demo","role":"MEMBER","n":4},{"email":"nhat.vo@sportiva.demo","role":"MEMBER","n":5},{"email":"mai.nguyen@sportiva.demo","role":"MEMBER","n":6},{"email":"anh.tran@sportiva.demo","role":"MEMBER","n":7},{"email":"nguyen.le@sportiva.demo","role":"MEMBER","n":8},{"email":"hang.pham@sportiva.demo","role":"MEMBER","n":9},{"email":"tram.vo@sportiva.demo","role":"MEMBER","n":10},{"email":"vy.nguyen@sportiva.demo","role":"MEMBER","n":11},{"email":"khang.tran@sportiva.demo","role":"MEMBER","n":12},{"email":"ngoc.le@sportiva.demo","role":"MEMBER","n":13},{"email":"linh.pham@sportiva.demo","role":"MEMBER","n":14},{"email":"hung.dang@sportiva.demo","role":"MEMBER","n":15},{"email":"vip.demo@sportiva.test","role":"MEMBER","n":16},{"email":"my.tran@sportiva.demo","role":"MEMBER","n":17},{"email":"duy.le@sportiva.demo","role":"MEMBER","n":18},{"email":"anh.bui@sportiva.demo","role":"MEMBER","n":19},{"email":"luan.pham@sportiva.demo","role":"MEMBER","n":20},{"email":"coach.badminton@sportiva.test","role":"COACH","n":21,"specialties":"Cầu lông – kỹ thuật nâng cao và chiến thuật"},{"email":"coach.quocbao@sportiva.demo","role":"COACH","n":22,"specialties":"Cầu lông – kỹ thuật cơ bản và di chuyển"},{"email":"coach.ngocha@sportiva.demo","role":"COACH","n":23,"specialties":"Cầu lông – huấn luyện người mới và đánh đôi"},{"email":"coach.yoga@sportiva.test","role":"COACH","n":24,"specialties":"Hatha Yoga"},{"email":"coach.khanhlinh@sportiva.demo","role":"COACH","n":25,"specialties":"Vinyasa Yoga"},{"email":"coach.thanhtruc@sportiva.demo","role":"COACH","n":26,"specialties":"Yoga thư giãn và giãn cơ"},{"email":"coach.dance@sportiva.test","role":"COACH","n":27,"specialties":"Hip-hop và kỹ thuật biểu diễn"},{"email":"coach.thaovy@sportiva.demo","role":"COACH","n":28,"specialties":"K-pop Dance và biên đạo"},{"email":"coach.minhchau@sportiva.demo","role":"COACH","n":29,"specialties":"Dance Fitness và nhảy hiện đại"},{"email":"receptionist.demo@sportiva.test","role":"RECEPTIONIST","n":30},{"email":"manager.demo@sportiva.test","role":"CENTER_MANAGER","n":31}],"entitlements":[{"email":"anh.bui@sportiva.demo","packageName":"Gói VIP 1 tháng","startDate":"2026-11-21","endDate":"2026-12-20","level":"VIP"},{"email":"duy.le@sportiva.demo","packageName":"Gói VIP 1 tháng","startDate":"2026-11-21","endDate":"2026-12-20","level":"VIP"},{"email":"expired@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Cầu lông","startDate":"2026-11-27","endDate":"2026-12-26","level":"STANDARD"},{"email":"hang.pham@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Yoga","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"hung.dang@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Dance","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"khang.tran@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Dance","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"khanh.pham@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Cầu lông","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"linh.pham@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Dance","startDate":"2026-10-29","endDate":"2026-11-27","level":"STANDARD"},{"email":"luan.pham@sportiva.demo","packageName":"Gói VIP 1 tháng","startDate":"2026-10-29","endDate":"2026-11-27","level":"VIP"},{"email":"mai.nguyen@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Yoga","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"my.tran@sportiva.demo","packageName":"Gói VIP 1 tháng","startDate":"2026-11-21","endDate":"2026-12-20","level":"VIP"},{"email":"ngoc.le@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Dance","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"nguyen.le@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Yoga","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"nhat.vo@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Cầu lông","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"phong.le@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Cầu lông","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"standard.demo@sportiva.test","packageName":"Gói STANDARD 3 tháng","sport":"Cầu lông","startDate":"2026-11-21","endDate":"2027-02-18","level":"STANDARD"},{"email":"tram.vo@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Yoga","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"},{"email":"vip.demo@sportiva.test","packageName":"Gói VIP 3 tháng","startDate":"2026-11-21","endDate":"2027-02-18","level":"VIP"},{"email":"vy.nguyen@sportiva.demo","packageName":"Gói STANDARD 1 tháng","sport":"Dance","startDate":"2026-11-21","endDate":"2026-12-20","level":"STANDARD"}],"template":[{"weekday":2,"slot":1,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":4,"slot":1,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":6,"slot":1,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":7,"slot":1,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":1,"slot":2,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":3,"slot":2,"name":"Yoga cân bằng cơ thể","sport":"Yoga","coach":"coach.khanhlinh@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":2,"slot":2,"name":"Kỹ thuật đánh cầu cơ bản","sport":"Cầu lông","coach":"coach.ngocha@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":4,"slot":2,"name":"Cầu lông nhập môn","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":5,"slot":2,"name":"Yoga thư giãn và giãn cơ","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":7,"slot":2,"name":"Yoga thư giãn và giãn cơ","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":6,"slot":2,"name":"Di chuyển và phản xạ","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":1,"slot":3,"name":"Cầu lông nhập môn","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":5,"slot":3,"name":"Cầu lông nhập môn","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":2,"slot":3,"name":"K-pop Dance cơ bản","sport":"Dance","coach":"coach.thaovy@sportiva.demo","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":6,"slot":3,"name":"K-pop Dance cơ bản","sport":"Dance","coach":"coach.thaovy@sportiva.demo","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":3,"slot":3,"name":"Di chuyển và phản xạ","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":4,"slot":3,"name":"Nhảy hiện đại nhập môn","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":7,"slot":3,"name":"Kỹ thuật đánh cầu cơ bản","sport":"Cầu lông","coach":"coach.ngocha@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":1,"slot":4,"name":"Nhảy hiện đại nhập môn","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":7,"slot":4,"name":"Nhảy hiện đại nhập môn","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":2,"slot":4,"name":"Yoga thư giãn và giãn cơ","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":4,"slot":4,"name":"Yoga thư giãn và giãn cơ","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":6,"slot":4,"name":"Yoga thư giãn và giãn cơ","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 02 – Harmony","capacity":12,"level":"STANDARD"},{"weekday":3,"slot":4,"name":"Kỹ thuật Hip-hop","sport":"Dance","coach":"coach.dance@sportiva.test","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":5,"slot":4,"name":"Kỹ thuật Hip-hop","sport":"Dance","coach":"coach.dance@sportiva.test","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":1,"slot":5,"name":"Chiến thuật đánh đôi","sport":"Cầu lông","coach":"coach.badminton@sportiva.test","room":"Sân cầu lông 02 – Rally","capacity":8,"level":"STANDARD"},{"weekday":5,"slot":5,"name":"Chiến thuật đánh đôi","sport":"Cầu lông","coach":"coach.badminton@sportiva.test","room":"Sân cầu lông 02 – Rally","capacity":8,"level":"STANDARD"},{"weekday":6,"slot":5,"name":"Chiến thuật đánh đôi","sport":"Cầu lông","coach":"coach.badminton@sportiva.test","room":"Sân cầu lông 02 – Rally","capacity":8,"level":"STANDARD"},{"weekday":7,"slot":5,"name":"Chiến thuật đánh đôi","sport":"Cầu lông","coach":"coach.badminton@sportiva.test","room":"Sân cầu lông 02 – Rally","capacity":8,"level":"STANDARD"},{"weekday":2,"slot":5,"name":"Di chuyển và phản xạ","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":3,"slot":5,"name":"Kỹ thuật đánh cầu cơ bản","sport":"Cầu lông","coach":"coach.ngocha@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":4,"slot":5,"name":"Kỹ thuật đánh cầu cơ bản","sport":"Cầu lông","coach":"coach.ngocha@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":8,"level":"STANDARD"},{"weekday":1,"slot":6,"name":"K-pop Dance cơ bản","sport":"Dance","coach":"coach.thaovy@sportiva.demo","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":4,"slot":6,"name":"K-pop Dance cơ bản","sport":"Dance","coach":"coach.thaovy@sportiva.demo","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":5,"slot":6,"name":"K-pop Dance cơ bản","sport":"Dance","coach":"coach.thaovy@sportiva.demo","room":"Phòng Dance 01 – Rhythm","capacity":15,"level":"STANDARD"},{"weekday":2,"slot":6,"name":"Dance Fitness","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":3,"slot":6,"name":"Dance Fitness","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":6,"slot":6,"name":"Dance Fitness","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":7,"slot":6,"name":"Dance Fitness","sport":"Dance","coach":"coach.minhchau@sportiva.demo","room":"Phòng Dance 02 – Flow","capacity":12,"level":"STANDARD"},{"weekday":3,"slot":4,"name":"yoga","sport":"Yoga","coach":"coach.thanhtruc@sportiva.demo","room":"Phòng Yoga 01 – Balance","capacity":6,"level":"STANDARD"},{"weekday":1,"slot":1,"name":"Kỹ thuật đánh cầu cơ bản","sport":"Cầu lông","coach":"coach.quocbao@sportiva.demo","room":"Sân cầu lông 01 – Smash","capacity":7,"level":"STANDARD"}]}';
DECLARE @now datetime2 = CONVERT(datetime2, SYSDATETIMEOFFSET() AT TIME ZONE 'SE Asia Standard Time');
INSERT dbo.sports(sport_name)
SELECT s.name FROM OPENJSON(@data,'$.sports') WITH (name nvarchar(255)) s
WHERE NOT EXISTS (SELECT 1 FROM dbo.sports p WHERE p.sport_name=s.name);

INSERT dbo.rooms(room_name,capacity)
SELECT s.name,s.capacity FROM OPENJSON(@data,'$.rooms') WITH (name nvarchar(255),capacity int) s
WHERE NOT EXISTS (SELECT 1 FROM dbo.rooms p WHERE p.room_name=s.name);

DECLARE @accounts table(email nvarchar(255) PRIMARY KEY, role_name nvarchar(255), n int, specialties nvarchar(500));
INSERT @accounts
SELECT * FROM OPENJSON(@data,'$.accounts') WITH (email nvarchar(255),role_name nvarchar(255) '$.role',n int,specialties nvarchar(500));
DECLARE @newUsers table(user_id int PRIMARY KEY,email nvarchar(255));
INSERT dbo.users(email,password_hash,full_name,phone,role_id,status,email_verified)
OUTPUT inserted.user_id,inserted.email INTO @newUsers
SELECT a.email,@password_hash,
       CONCAT(CASE a.role_name WHEN 'COACH' THEN N'HLV demo ' WHEN 'MEMBER' THEN N'Hội viên demo '
           WHEN 'CENTER_MANAGER' THEN N'Quản lý demo ' ELSE N'Lễ tân demo ' END,a.n),
       CONCAT(N'099980',RIGHT(CONCAT('0000',a.n),4)),r.role_id,N'ACTIVE',1
FROM @accounts a JOIN dbo.roles r ON r.role_name=a.role_name
WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.email=a.email OR u.phone=CONCAT(N'099980',RIGHT(CONCAT('0000',a.n),4)));

INSERT dbo.member_profiles(member_id)
SELECT u.user_id FROM @newUsers u JOIN @accounts a ON a.email=u.email WHERE a.role_name='MEMBER';

INSERT dbo.coach_profiles(coach_id,specialties)
SELECT u.user_id,a.specialties FROM @newUsers u JOIN @accounts a ON a.email=u.email WHERE a.role_name='COACH';

INSERT dbo.member_subscriptions(member_id,package_id,start_date,end_date,status,entitlement_level,selected_sport_id)
SELECT u.user_id,p.package_id,e.startDate,e.endDate,'ACTIVE',e.level,s.sport_id
FROM OPENJSON(@data,'$.entitlements') WITH (email nvarchar(255),packageName nvarchar(255),sport nvarchar(255),startDate date,endDate date,level nvarchar(30)) e
JOIN @newUsers u ON u.email=e.email
CROSS APPLY (SELECT TOP (1) package_id FROM dbo.membership_packages WHERE package_name=e.packageName AND status='ACTIVE' AND access_level=e.level ORDER BY package_id) p
LEFT JOIN dbo.sports s ON s.sport_name=e.sport
WHERE CONVERT(date,@now) BETWEEN e.startDate AND e.endDate AND (e.level='VIP' OR s.sport_id IS NOT NULL);

DECLARE @coaches table(email nvarchar(255) PRIMARY KEY,coach_id int NOT NULL);
INSERT @coaches
SELECT u.email,u.user_id FROM @accounts a JOIN dbo.users u ON u.email=a.email AND u.status='ACTIVE'
JOIN dbo.roles r ON r.role_id=u.role_id AND r.role_name='COACH'
JOIN dbo.coach_profiles p ON p.coach_id=u.user_id AND p.specialties=a.specialties
WHERE a.role_name='COACH';

DECLARE @templateName nvarchar(150)=N'Lịch tập tiêu chuẩn Sportiva';
DECLARE @manager int=(SELECT u.user_id FROM dbo.users u JOIN dbo.roles r ON r.role_id=u.role_id AND r.role_name='CENTER_MANAGER' WHERE u.email='manager.demo@sportiva.test' AND u.status='ACTIVE');
DECLARE @templateId int=(SELECT template_id FROM dbo.weekly_schedule_templates WHERE template_name=@templateName);
DECLARE @template table(weekday int,slot int,name nvarchar(150),sport_id int,coach_id int,room_id int,capacity int,level nvarchar(30),skip_reason nvarchar(150));
INSERT @template
SELECT e.weekday,e.slot,e.name,s.sport_id,h.coach_id,r.room_id,e.capacity,e.level,
       CASE WHEN s.sport_id IS NULL OR h.coach_id IS NULL OR r.room_id IS NULL OR r.capacity<e.capacity
            THEN N'Không có bộ môn, HLV đúng chuyên môn hoặc phòng đủ sức chứa'
            WHEN @templateId IS NULL AND @manager IS NULL THEN N'Không có quản lý DEMO phù hợp' END
FROM OPENJSON(@data,'$.template') WITH (weekday int,slot int,name nvarchar(150),sport nvarchar(255),coach nvarchar(255),room nvarchar(255),capacity int,level nvarchar(30)) e
LEFT JOIN dbo.sports s ON s.sport_name=e.sport LEFT JOIN dbo.rooms r ON r.room_name=e.room
LEFT JOIN @coaches h ON h.email=e.coach;

IF @templateId IS NULL AND EXISTS (SELECT 1 FROM @template WHERE skip_reason IS NULL)
BEGIN
    INSERT dbo.weekly_schedule_templates(template_name,version,saved_by) VALUES(@templateName,0,@manager);
    SET @templateId=CONVERT(int,SCOPE_IDENTITY());
END;

UPDATE e SET skip_reason=N'Trùng HLV hoặc phòng trong cùng ngày và ca với mục đã lưu'
FROM @template e
WHERE e.skip_reason IS NULL AND EXISTS (
    SELECT 1 FROM dbo.weekly_schedule_template_entries t
    WHERE t.template_id=@templateId AND t.day_of_week=e.weekday AND t.slot_number=e.slot
      AND (t.coach_id=e.coach_id OR t.room_id=e.room_id)
      AND NOT (t.coach_id=e.coach_id AND t.room_id=e.room_id AND t.sport_id=e.sport_id
               AND t.class_name=e.name AND t.max_capacity=e.capacity AND t.required_access_level=e.level));

INSERT dbo.weekly_schedule_template_entries(template_id,day_of_week,slot_number,class_name,sport_id,coach_id,room_id,max_capacity,required_access_level)
SELECT @templateId,e.weekday,e.slot,e.name,e.sport_id,e.coach_id,e.room_id,e.capacity,e.level
FROM @template e
WHERE e.skip_reason IS NULL AND NOT EXISTS (
    SELECT 1 FROM dbo.weekly_schedule_template_entries t
    WHERE t.template_id=@templateId AND t.day_of_week=e.weekday AND t.slot_number=e.slot
      AND (t.coach_id=e.coach_id OR t.room_id=e.room_id));
IF @@ROWCOUNT>0 UPDATE dbo.weekly_schedule_templates SET version=version+1 WHERE template_id=@templateId;


COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
