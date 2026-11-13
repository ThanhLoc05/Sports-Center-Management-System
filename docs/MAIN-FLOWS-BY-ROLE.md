# Main flow theo vai trò và API được gọi

Tài liệu này mô tả luồng chính ở chế độ kết nối backend (API mode), dựa trên các màn hình và controller hiện có. Đường dẫn dưới đây viết rút gọn; frontend tự thêm tiền tố `/api/v1`. Các request cần đăng nhập gửi JWT trong header `Authorization: Bearer ...`, backend tiếp tục kiểm tra vai trò và quyền sở hữu dữ liệu.

## Luồng chung

```text
Đăng nhập → Dashboard → vào màn hình theo vai trò
     ↓                         ↓
POST /users/login       GET/POST/PUT/... /api/v1/...
     ↓                         ↓
nhận JWT + user         Controller → Service → SQL Server
```

- Đăng nhập: `POST /users/login` với email/mật khẩu; phản hồi gồm `token` và `user`.
- Đăng ký tài khoản tự phục vụ: `POST /users/register`; backend tạo tài khoản `MEMBER`.
- Khi đã đăng nhập, API dùng JWT. Mở trang thường tạo các request GET để tải dữ liệu; bấm lưu/xác nhận mới phát sinh request ghi.
- `/api/assistant` là API riêng của trợ lý AI, không đi qua `/api/v1` và không phải luồng nghiệp vụ lưu SQL của hệ thống.
- Nếu chạy **Demo mode** trong test, dữ liệu thay đổi nằm ở localStorage, không phải database. Các luồng bên dưới giả định API mode.

## MEMBER — học viên

### Đăng ký gói và thanh toán

1. Mở Gói thành viên: tải danh mục và lịch sử gói; luồng checkout mới đồng thời đọc các yêu cầu trước đó.
   - `GET /membership-packages`
   - `GET /memberships/members/{memberId}`
   - `GET /membership-orders?memberId={memberId}`
2. Chọn gói, loại đăng ký/gia hạn và phương thức rồi tạo đơn. Backend tạo `MembershipOrder` cùng hóa đơn `PENDING`.
   - `POST /membership-orders` — body gồm `memberId`, `packageId`, tùy chọn `sourceSubscriptionId`, `paymentMethod`; header `Idempotency-Key`.
3. Xem chi tiết/thăm dò trạng thái đơn:
   - `GET /membership-orders/{orderId}`
   - QR cần đọc cấu hình nhận tiền: `GET /payments/bank-account`.
   - Đơn tiền mặt chờ lễ tân; học viên không tự xác nhận.
   - Đơn chuyển khoản QR chỉ chuyển sang hoàn tất khi webhook SePay đã xác thực giao dịch. Đây là request từ SePay tới `POST /payments/webhooks/sepay`, không phải request do trình duyệt học viên gọi.
4. Sau xác nhận, frontend làm mới gói và hóa đơn:
   - `GET /memberships/members/{memberId}/active`
   - `GET /memberships/members/{memberId}`
   - `GET /payments/members/{memberId}/invoices`

### Đặt và hủy lớp

1. Xem lịch/danh sách lớp: `GET /classes`; xem sức chứa: `GET /classes/{classId}/capacity`.
2. Đặt lớp cho chính mình: `POST /classes/{classId}/book` (không truyền `memberId`; backend lấy người dùng từ JWT).
3. Xem lịch sử: `GET /members/{memberId}/bookings`; hủy một booking: `DELETE /bookings/{bookingId}`.
4. Backend kiểm tra gói còn hiệu lực, lớp còn chỗ, lịch và booking trùng; giao diện không tự quyết định quyền vào lớp.

### Tập luyện, hỗ trợ và thông báo

- Giáo án/kết quả cá nhân: `GET /workout-plans/member/{memberId}`, `GET /workout-logs/member/{memberId}`.
- Giáo án theo lớp đã đặt: frontend đọc booking trước (`GET /members/{memberId}/bookings`), rồi gọi `GET /workout-plans/class/{classId}` cho từng lớp còn BOOKED.
- Gửi yêu cầu hỗ trợ: `POST /support-tickets`; danh sách của mình: `GET /support-tickets/my`.
- Thông báo: `GET /notifications`, kết nối cập nhật trực tiếp `GET /notifications/stream` (SSE), đánh dấu đã đọc `PATCH /notifications/{id}/read`.
- Gửi đánh giá HLV/lớp: `POST /feedbacks`; xem đánh giá: `GET /feedbacks/coach/{coachId}` hoặc `GET /feedbacks/class/{classId}`.

## RECEPTIONIST — lễ tân

### Tiếp nhận thành viên tại quầy

1. Tra cứu danh sách: `GET /users` (có thể lọc `roleId`, `status`, `keyword`); xem tài khoản: `GET /users/{userId}`.
2. Tạo thành viên mới: `POST /users/register`. Endpoint đăng ký công khai tạo vai trò MEMBER; không gửi vai trò tùy ý từ giao diện.
3. Có thể cập nhật hồ sơ thành viên qua `PUT /users/{userId}/profile` trong phạm vi được backend cho phép.

### Tạo đơn, thu tiền và hỗ trợ thanh toán

1. Đọc gói/đơn hiện có: `GET /membership-packages`, `GET /membership-orders` (lễ tân được xem các đơn).
2. Tạo đơn đăng ký/gia hạn hộ thành viên: `POST /membership-orders` với `memberId` được chọn.
3. Xác nhận đơn CASH sau khi nhận đủ tiền: `POST /membership-orders/{orderId}/confirm-payment` với `Idempotency-Key` và `version`.
4. Đơn BANK_TRANSFER: lễ tân xem chi tiết/trạng thái bằng `GET /membership-orders/{orderId}`; không được xác nhận thủ công. Webhook SePay mới được xác nhận QR.
5. Hóa đơn không thuộc đơn MembershipOrder có thể lập qua `POST /payments/invoices`, xem hóa đơn chờ `GET /payments/invoices/pending`, và xác nhận thu qua `POST /payments/invoices/{invoiceId}/pay`. Endpoint thanh toán chung từ chối hóa đơn gắn MembershipOrder để tránh lệch trạng thái.

### Đặt lớp, điểm danh, hỗ trợ

- Đặt/hủy lớp hộ: `GET /classes`, `GET /classes/{classId}/capacity`, `POST /classes/{classId}/book?memberId={memberId}`, `DELETE /bookings/{bookingId}`.
- Xem sổ lớp: `GET /classes/{classId}/bookings` hoặc `/students`.
- Check-in: `POST /attendance`; xem sổ điểm danh lớp: `GET /attendance/classes/{classId}`.
- Xử lý yêu cầu hỗ trợ: `GET /support-tickets`, tùy chọn `GET /support-tickets/member/{memberId}`, phản hồi/đóng phiếu `PATCH /support-tickets/{id}/resolve`.
- Lễ tân không có quyền duyệt hoàn tiền; thao tác hoàn là quyền CENTER_MANAGER.

## COACH — huấn luyện viên

### Lịch dạy và học viên phụ trách

1. Tải lớp của chính mình: `GET /classes/my-classes` (backend lấy coachId từ JWT).
2. Với từng lớp, xem danh sách học viên/booking: `GET /classes/{classId}/students`, `GET /classes/{classId}/bookings`.
3. Theo dõi chuyên cần và học viên vắng: `GET /attendance/classes/{classId}`, `GET /attendance/classes/{classId}/absentees`.
4. Ghi check-in cho học viên đủ điều kiện: `POST /attendance`.

### Soạn giáo án và ghi kết quả

- Đọc giáo án/kết quả của HLV: `GET /workout-plans/coach/{coachId}`, `GET /workout-logs/coach/{coachId}`.
- Tạo/sửa/xóa giáo án: `POST /workout-plans`, `PUT /workout-plans/{id}`, `DELETE /workout-plans/{id}`. Backend tự gắn coachId từ JWT khi tạo; khi sửa/xóa chỉ HLV sở hữu hoặc quản lý được phép.
- Ghi nhật ký buổi tập: `POST /workout-logs`; cập nhật nhận xét: `PATCH /workout-logs/{id}/feedback?feedback=...`.
- Gửi thông báo/bài tập: `POST /notifications`; danh sách/stream/đánh dấu đã đọc dùng các API notifications chung.
- Cập nhật hồ sơ nghề nghiệp của chính mình: `PUT /users/{userId}/coach-profile`.
- Xem/ghi nhận xét HLV đánh giá học viên: `GET /feedbacks/member/{memberId}`, `POST /feedbacks`.

## CENTER_MANAGER — quản lý trung tâm

Quản lý có các quyền đọc/ghi cao nhất trong các luồng hiện có; các thay đổi quan trọng vẫn đi qua API riêng và được backend kiểm tra.

### Thành viên và nhân sự

- Danh sách/tìm kiếm: `GET /users`.
- Đổi trạng thái: `PATCH /users/{userId}/status?status=ACTIVE|INACTIVE|BLOCKED`.
- Đổi vai trò: `PATCH /users/{userId}/role?roleName=...` (hoặc `roleId`).
- Sửa thông tin nhân sự: `PUT /users/{userId}/details`.
- Đặt lại mật khẩu theo quyền quản lý: `POST /users/{userId}/change-password`.

### Gói, lớp và cơ sở vật chất

- Gói tập: `GET /memberships/packages`, `POST /memberships/packages`, `PUT /memberships/packages/{packageId}`, `DELETE /memberships/packages/{packageId}`.
- Lớp học: `GET /classes`, `POST /classes`, `PUT /classes/{classId}`, `POST /classes/{classId}/cancel`.
- Bộ môn/phòng: `GET /sports`, `POST|PUT|DELETE /sports/{sportId}`; `GET /rooms`, `POST|PUT|DELETE /rooms/{roomId}`.
- Lưu ý: component API của một số màn hình chỉ hỗ trợ đọc hoặc chưa hỗ trợ đủ các thao tác ghi; endpoint backend có tồn tại không đồng nghĩa mọi nút giao diện đã kết nối.

### Thanh toán, báo cáo, vận hành

- Theo dõi đơn/hóa đơn: `GET /membership-orders`, `GET /payments/invoices/pending`, `GET /payments/members/{memberId}/invoices`.
- Hoàn tiền hóa đơn đã PAID: `POST /payments/invoices/{invoiceId}/refund`. Với hóa đơn thuộc đơn gói, backend đồng bộ invoice `REFUNDED`, order `REFUNDED`, subscription `CANCELLED` trong cùng transaction; thao tác này chỉ ghi nhận, không tự chuyển tiền ngân hàng.
- Báo cáo theo khoảng thời gian: `GET /reports/summary?startDate=...&endDate=...` (tổng thu, hoàn, ròng, số lượng, phân bổ phương thức).
- Cấu hình ngân hàng: `GET /payments/bank-account`, `PUT /payments/bank-account`, `DELETE /payments/bank-account?version=...`.
- Nhật ký: `GET /audit-logs`, `GET /audit-logs/{auditId}`, xuất CSV `GET /audit-logs/export`.
- Quản lý có thể tạo thông báo qua `POST /notifications`; nhận thông báo dùng API chung.

## Vai trò và luồng cần phân biệt

- `MANAGER` được frontend coi tương thích với `CENTER_MANAGER`; backend chính thức thường dùng `CENTER_MANAGER`.
- Luồng đăng ký/gia hạn mới nên dùng `/membership-orders` để đơn, invoice và xác nhận thanh toán đồng bộ. Các API cũ `POST /memberships/subscribe` và `POST /memberships/{subscriptionId}/renew` vẫn còn; chúng không đi qua quy trình MembershipOrder. Không dùng các endpoint cũ làm luồng demo thanh toán chuẩn.
- API backend tồn tại chưa chắc UI đã dùng endpoint đó. Ví dụ trang quản lý gói ở API mode hiện đọc danh mục nhưng chưa bật đầy đủ tạo/sửa/xóa; đối chiếu màn hình nếu cần demo thao tác cụ thể.
- Lịch sử điểm danh của MEMBER được hỗ trợ bởi `GET /attendance/members/{memberId}`, `/rate`, `/count`; hiện dashboard/màn hình không nhất thiết gọi toàn bộ các endpoint này trong mỗi lần mở.
