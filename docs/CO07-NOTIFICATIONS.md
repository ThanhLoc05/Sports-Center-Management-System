# CO07 — Thông báo và bài tập

## Database và khởi động

V9 thêm `general_notifications`, một dòng GENERAL cho mỗi người nhận, cùng FK đến `users` và index `(recipient_id, created_at DESC, id DESC)`. Không seed hoặc khôi phục GENERAL cũ vốn chỉ tồn tại trong bộ nhớ.

Migration chạy thủ công sau backup/kiểm tra đúng database và phê duyệt của người quản trị. Script dừng nếu đối tượng đã tồn tại; không tự sửa hoặc xóa schema. Không chạy toàn bộ schema trên database đang có dữ liệu. Giữ `spring.jpa.hibernate.ddl-auto=validate`; không dùng `update/create` để bỏ qua migration.

## API

Mọi endpoint dưới đây dùng Bearer authentication hiện có.

| Method/endpoint | Quyền và kết quả |
|---|---|
| `POST /api/v1/notifications` | COACH/CENTER_MANAGER theo validation hiện có; COACH chỉ gửi cho học viên BOOKED của lớp phụ trách. Response 202 với acceptedRecipients, onlineRecipientsAtSend, workoutPlanIds. |
| `GET /api/v1/notifications/stream` | Stream của chính user đăng nhập; comment `connected`, sau đó comment `keepalive` mỗi khoảng 15 giây và event `notification`. |
| `GET /api/v1/notifications?page=0&size=20` | GENERAL của chính user; page từ 0, tối đa 100000; size 1–100. Response `{content, page, size, hasNext}`. |
| `PATCH /api/v1/notifications/{id}/read` | Chỉ người nhận; ID không tồn tại/không thuộc người nhận trả 404. Đọc lặp không đổi readAt. |

GENERAL được lưu trong transaction và phát sau commit. Không phát khi transaction rollback. `onlineRecipientsAtSend` là số người có subscriber tại thời điểm gửi, không phải xác nhận người dùng đã đọc.

HOMEWORK tiếp tục tạo giáo án và phát SSE; không tạo dòng lịch sử GENERAL. Event GENERAL dùng ID database; event HOMEWORK giữ ID trong bộ nhớ. FE phân biệt loại nội dung khi deduplicate, không coi hai loại cùng số ID là một thông báo.

History item gồm `id, senderId, recipientId, title, content, link, kind, createdAt, readAt`. SSE payload hiện có được giữ nguyên.

## Vòng đời và giao diện

- Layout sở hữu một consumer SSE chung; inbox tải lịch sử bằng API, không dùng localStorage làm lịch sử chính thức.
- GET history và SSE được gộp theo ID GENERAL; trạng thái đã đọc không bị response cũ ghi đè.
- Cache/lifecycle tách theo tài khoản; logout hủy kết nối và xóa dữ liệu phiên.
- JWT filter và filter chain dùng chung RequestAttributeSecurityContextRepository để giữ authentication qua ASYNC của cùng request, không tạo HTTP session.
- OSIV vẫn hoạt động cho endpoint khác, chỉ loại riêng stream để không giữ JDBC connection trong thời gian SSE mở.
- Một scheduler do Spring quản lý gửi heartbeat comment, không tạo dữ liệu nghiệp vụ. Lỗi ghi vào client đã đóng sẽ gỡ emitter; scheduler được shutdown cùng context.

## Kiểm thử

Unit/MVC tests dùng mock repositories; các test SpringBoot context cần database riêng tương thích V9. Không chạy test dùng database mặc định/chung. E2E ghi phải được phê duyệt, mỗi kịch bản có budget request và đối chiếu SQL trước khi retry.

Các test chính: `SseAsyncSecurityTest`, `NotificationOsivScopeTest`, `NotificationStreamTest`, `NotificationDeliveryServiceTest`, `GeneralNotificationHistoryTest`, `notification-history.test.tsx`, `notifications.test.tsx`, `notification-integration.test.ts`.
