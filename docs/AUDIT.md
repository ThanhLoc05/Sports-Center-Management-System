# Audit yêu cầu, repository và API

Ngày kiểm tra: 15/10/2026 (Asia/Ho_Chi_Minh). Đọc yêu cầu 4 vai trò/6 flow, SwaggerHub 1.0.0, toàn bộ controller/DTO, security, service/repository/entity, SQL script, cấu hình, README và FE hiện có. Đây là đánh giá tĩnh, chưa chạy BE với database thật.

## Nguồn và cách đưa về project

Repository: https://github.com/ThanhLoc05/Sports-Center-Management-System

| Nhánh          | Commit snapshot                            | Kết quả                                               |
| -------------- | ------------------------------------------ | ----------------------------------------------------- |
| BE             | `d1c8ef97585add7a393f0f36453844319f4f103d` | Toàn bộ source ở `backend/`, không chỉnh sửa nội dung |
| FE             | `2170dddf5fc067fea52e7da5ec58dbe6fc605bb9` | Bản gốc giữ tại `reference/frontend/`; FE mới ở root  |
| main / Testing | `e3332e67cf6747d80b8ccfe93f47bd3fd7cc4e0d` | Chỉ có README                                         |

Lịch sử và mọi remote branch đã được fetch về Git local. Không push. Nhánh làm việc `codex/sportiva-frontend` dựa trên FE. Swagger gốc tải từ `https://api.swaggerhub.com/apis/envo/SportsCenterManagementSystem/1.0.0`, giữ nguyên `docs/openapi.json`.

FE gốc dùng mock authentication, chưa gọi API; chỉ có manager/member, không có luồng HLV/lễ tân hoàn chỉnh. Vì vậy FE mới thay phần mock auth bằng session JWT, route guard, service gateway và các module riêng. Bản gốc vẫn còn nguyên để đối chiếu.

## Mức hoàn thành từng flow

| Flow                                | FE đã triển khai                                                                                                                          | API thực hiện có                                    | Khoảng trống                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1. Users & membership (required)    | Đăng ký/đăng nhập, danh sách/lọc/xuất CSV, chi tiết, đổi trạng thái; lịch sử gói, đăng ký/gia hạn/hủy                                     | UserController, MembershipController                | Thiếu update profile, password reset/change, tạo nhân viên, role API, danh mục gói; lễ tân không được tìm hồ sơ |
| 2. Booking & schedule (required)    | Tạo/sửa/hủy lớp, phân công HLV/phòng/bộ môn theo ID, lịch tuần 24h/danh sách, capacity, book/cancel, lọc theo lớp/thành viên              | ClassController, BookingController                  | Thiếu catalog controller, server-side pagination, chính sách xung đột lịch/điều kiện gói                        |
| 3. Payments & reports (required)    | Tạo hóa đơn PENDING, xác nhận PAID, hoàn tiền, lịch sử theo member, pending list, phiếu thu in/PDF, CSV, khoảng ngày doanh thu, by-method | PaymentController, ReportController                 | Không có list-all hóa đơn, paidAt, payment provider/webhook, báo cáo series theo ngày, hóa đơn điện tử          |
| 4. Training & attendance (optional) | Điểm danh, lịch sử, roster, kế hoạch/bài tập/nhận xét/kết quả trong demo                                                                  | AttendanceController; training chỉ có entity/script | Chưa có controller training/profile học viên; không có check-in trung tâm độc lập                               |
| 5. AI recommendation (optional)     | Form mục tiêu/trình độ/thời gian, mẫu bài tập theo quy tắc, lưu mẫu cá nhân demo                                                          | Không có                                            | Cần provider server-side, dữ liệu ngữ cảnh, policy an toàn, kiểm thử chất lượng                                 |
| 6. AI assistant (optional)          | Chat demo tra lịch của tài khoản hiện tại và gói demo                                                                                     | Không có                                            | Không có inference/streaming, conversation store, service knowledge API                                         |

Trong API mode, tính năng chưa hỗ trợ bị khóa/hiển thị trạng thái chờ endpoint. Không đưa tên phòng, giá gói hay biểu đồ demo vào dữ liệu thật. AI được ghi rõ là demo theo quy tắc. Nhật ký phía client không được gọi là audit log server.

## Khác biệt Swagger ↔ BE

| Nội dung                 | Swagger 1.0.0                                    | BE thực tế và FE sử dụng                                                                                |
| ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Cập nhật user            | `PATCH /users/{id}`                              | `PATCH /users/{id}/status?status=...`                                                                   |
| Class fields             | `name`, `description`, `maxCapacity`, `isActive` | `className`, `sportId`, `coachId`, `roomId`, `maxCapacity`, `scheduleTime`, `durationMinutes`, `status` |
| Attendance input         | `memberId`, `classScheduleId`, `status`          | `memberId`, `classId`, `checkedInBy`, `status`                                                          |
| Attendance output        | `userId`, `classScheduleId`, `checkInTime`       | `memberId`, `classId`, `checkedInBy`, `checkedInAt`                                                     |
| Invoice input/output     | `userId`, `userMembershipId`, `totalAmount`      | `memberId`, `subscriptionId`, `amount`, `paymentStatus`                                                 |
| Booking input            | JSON BookingRequest                              | Controller nhận `memberId` trong query, không nhận body                                                 |
| Public available classes | Mô tả là public                                  | Global SecurityFilterChain vẫn yêu cầu JWT, trừ login/register                                          |
| Extra routes             | Không có                                         | Invoice detail/member history/pending; revenue by-method; attendance count/rate                         |

`src/lib/types.ts` mô tả DTO BE; `src/lib/openapi.d.ts` chỉ là bản sinh từ Swagger để tham chiếu, không dùng làm actual domain model.

## Blocker cần xử lý trước production

### P0 · SQL script không khớp entity, BE chưa có baseline DB chạy được từ repo

`backend/src/main/resources/db/migration/V1__core_flows.sql` tạo `users.id` + cột `role`; `User.java` lại cần `user_id`, `role_id` và bảng `roles`. Tương tự: `memberships`/`user_memberships` khác bảng membership entity; `classes.name/is_active` khác `class_name/schedule_time/status`; invoices `user_id/total_amount` khác `member_id/amount/payment_status`; attendance khác tên bảng/cột. `pom.xml` không có Flyway; `ddl-auto=validate` không tạo schema. Script cũng không seed `roles`. Cần migration đúng theo entity và seed bốn role/catalog, kiểm tra bằng SQL Server trên database trống. Chưa thay schema BE trong nhiệm vụ FE.

### P0 · Kiểm soát quyền sở hữu tài nguyên còn thiếu ở BE

`PaymentController.getInvoice` và `getMemberInvoices` không kiểm tra owner/role. Global JWT không bảo đảm người dùng chỉ đọc hóa đơn của mình. `BookingController.getBooking` và `getClassBookings` cũng chỉ đòi authenticated, không giới hạn tài nguyên theo owner/lớp phụ trách. `AttendanceController.getAttendance` theo ID không kiểm tra ownership; history/rate/count theo member đã có `isOwnerOrAuthorized`. Đọc attendance theo class chỉ kiểm tra role chung, chưa kiểm tra coachId. Coach ghi attendance có thể chọn lớp ngoài quyền. Cần authorization ở backend cho từng object. Route guard và bộ lọc FE không thay thế được kiểm soát server.

### P1 · Secret và vận hành backend

`application.yaml` có fallback JWT secret công khai; phải buộc cấu hình secret mạnh từ môi trường khi triển khai. Dùng DB credentials thực qua môi trường; TLS/reverse proxy, rate limit login và chính sách mật khẩu cần được cấu hình. Session hiện chỉ có access token một giờ; không có refresh/logout invalidation/reset password API. FE xóa session khi 401 hoặc exp, không tự retry mutation.

### P1 · Thiếu các endpoint để thỏa toàn bộ mô tả nghiệp vụ

- Gói tập, sport, room có entity/repository/DTO nhưng không có controller/service public tương ứng.
- Profile có method trong service nhưng không có route để đọc mục tiêu tập của học viên/cập nhật.
- Không có cấp quyền, tạo tài khoản nhân viên, audit log, notifications, training CRUD/log, support, AI.
- `BookingService.getClassStudents` có trong service nhưng không được expose ở controller. Coach không thể resolve tên/liên hệ/mục tiêu học viên bằng UserController vì chỉ owner/manager được đọc. FE hiển thị ID khi chưa có endpoint được phép.
- Receptionist không thể list/search user hoặc GET hồ sơ member. Hiện FE cung cấp form ID cho các operation được phép và ghi rõ giới hạn.
- User/class/invoice list không có pagination/filter đầy đủ. FE paginate client, cần bổ sung server pagination khi dữ liệu lớn.

### P1 · Tính đúng nghiệp vụ và cạnh tranh

- Booking dùng pessimistic lock kiểm soát capacity (điểm tốt), nhưng chưa yêu cầu membership active, chưa chặn trùng giờ giữa các lớp, chưa kiểm tra role MEMBER của người được book.
- Class create/update chưa kiểm tra trùng phòng/HLV và chưa kiểm tra coach role. Update capacity với roomId không đổi có thể vượt capacity phòng. Demo có các guard này; backend vẫn cần xử lý độc lập.
- Renew tạo gói mới từ hôm nay, không cộng phần thời hạn chưa dùng, chưa chặn nhiều active subscription trong một số trường hợp renew lịch sử. UI có cảnh báo rõ hành vi hiện tại.
- Subscribe kích hoạt ngay, tách khỏi invoice/payment; invoice cho phép amount do client gửi, default BE là PAID nếu thiếu paymentStatus. FE luôn gửi PENDING và cần xác nhận riêng; production phải tính giá ở server và có workflow thu tiền/idempotency.
- Payment service đã chặn pay khi không PENDING và refund khi không PAID. Chưa có idempotency key hay locking/versioning cho các request cạnh tranh; cần bảo vệ thao tác thu/hoàn khi nhiều nhân viên thao tác đồng thời.
- Attendance chưa kiểm tra lớp thuộc HLV, membership/booking active, thời gian buổi tập, checkedInBy phải là current principal; invoice cũng nhận receptionistId từ request. Cần lấy actor từ session server.
- Report lọc `createdAt`, không phải `paidAt`, nên chưa phải báo cáo dòng tiền theo ngày thu. Hoàn tiền đổi trạng thái nên có thể làm thay đổi báo cáo kỳ trước. Cần ledger/paidAt/refundedAt để có lịch sử tài chính chính xác.
- Không có HTTP idempotency key/unique concurrency guards đầy đủ cho subscribe/renew/payment/attendance. Không được tự retry POST ở FE.

## Quyết định frontend

React 19 + TypeScript strict, Vite; React Router cho route/role guards; TanStack Query cho trạng thái truy vấn/cache và invalidation; fetch wrapper có timeout 15 giây, lỗi tiếng Việt, Bearer token chỉ trong API mode; Recharts lazy chunk; Lucide; font Be Vietnam Pro được self-host.

Session JWT trong sessionStorage (xóa khi tab kết thúc, sign-out hoặc 401); không lưu password. Không có API key trong FE. Demo data dùng localStorage riêng và không phải cơ chế phân quyền tin cậy. React render text, không dùng dangerouslySetInnerHTML. CSV escape quote/newline và chống spreadsheet formula injection. Dialog có tên, focus trap, Escape, focus restore, input labels; motion giảm theo thiết lập OS. Lịch/tiền tệ theo Việt Nam; naive Java LocalDateTime được hiểu là UTC+7.

Live API chỉ gọi nguồn có quyền: list users cho manager; coach class query có coachId; member booking/subscription/history chỉ lấy ID bản thân; hóa đơn toàn trung tâm chưa có route nên dùng pending list hoặc member filter. Khi API không cung cấp số liệu, hiện `—` hoặc giải thích giới hạn, không tự tạo KPI.

## Giới hạn xác minh

Máy hiện có Node/npm/Chrome nhưng không có Java runtime; chưa có SQL Server/schema/account backend được xác minh. Chưa thể chạy BE, xác nhận authentication thật, CORS/proxy với server đang hoạt động, JWT production, DB migration hoặc giao dịch đồng thời. Có production build FE, kiểm thử fetch contract bằng response mock và workflow demo; xem `QA.md`. Các kết quả đó không chứng minh hệ thống đã sẵn sàng production end-to-end.
