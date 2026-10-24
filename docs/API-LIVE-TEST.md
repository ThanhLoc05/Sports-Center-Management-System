# Kết nối backend local — đã kiểm thử ngày 22/10/2026

- Frontend: http://127.0.0.1:5173
- Backend: http://127.0.0.1:8080
  SQL Server: localhost,1433 — database `SportsCenterDB`.

## Cấu hình và khởi động lại

Frontend mặc định dùng API thật; `.env` có `VITE_DATA_MODE=api`, `VITE_API_BASE_URL=` và `API_PROXY_TARGET=http://127.0.0.1:8080`. Cả `npm run dev` và `npm run preview` chuyển `/api` tới backend. Phiên đăng nhập demo cũ không được dùng trong API mode; lỗi kết nối không tự chuyển sang dữ liệu mẫu.

Trong thư mục gốc dự án, mở hai terminal:

```powershell
# Terminal 1: khởi chạy backend nguyên bản bằng Java 17 đã kiểm tra tương thích.
powershell -ExecutionPolicy Bypass -File scripts/start-backend-local.ps1
```

```powershell
# Terminal 2: frontend
npm run dev
```

Backend sử dụng biến môi trường từ `.env.backend.local`; file này bị Git bỏ qua. Không thay đổi `backend/pom.xml`, `application.yaml`, controller, service hay entity. Đã so sánh SHA-256 của 82 file trong `backend/` (bỏ qua output `target/`): không có file nào thêm hoặc thay đổi.

## Database và tài khoản

Đã tạo database local mới với 11 bảng khớp tên cột và kiểu dữ liệu JPA hiện có; backend đã chạy thành công với chế độ Hibernate `validate`. Database có vai trò, ba bộ môn, ba phòng và ba gói tập. Tài khoản SQL runtime riêng chỉ có quyền đọc/ghi dữ liệu trong database mới.

Các tài khoản được đăng ký qua API thật rồi gán vai trò ban đầu trực tiếp trong SQL local; không thêm endpoint cấp quyền:

| Vai trò           | Email                    | User ID |
| ----------------- | ------------------------ | ------- |
| Quản lý trung tâm | duyban246@gmail.com      | 1       |
| Huấn luyện viên   | coach@sportiva.local     | 2       |
| Lễ tân            | reception@sportiva.local | 3       |
| Thành viên        | member@sportiva.local    | 4       |

Mật khẩu được lưu trong `.local/accounts.json`, bị Git bỏ qua. Đây là các tài khoản của ứng dụng local, không phải mật khẩu Gmail.

## Kết quả xác minh

- Build frontend: thành công (`tsc -b` và Vite build).
- Frontend tests: 8 file, 83/83 test đạt. Các test fixture bật demo riêng trong môi trường test; ứng dụng dev/build dùng API.
- Test kết nối qua frontend proxy: POST login thiếu dữ liệu trả 400; truy cập endpoint bảo vệ chưa đăng nhập trả 403.
- Test tài khoản quản lý qua `npm run test:api:live`: đăng nhập, JWT, đọc hồ sơ và danh sách lớp đều thành công.
- 28/28 yêu cầu nghiệp vụ qua frontend proxy trả mã HTTP đúng kỳ vọng. Phủ đăng nhập bốn vai trò, từ chối quyền thành viên truy cập danh sách người dùng (403), mật khẩu sai (401), tạo lớp (201), đặt lớp (201), chống đặt trùng (400), hủy/đặt lại lớp, đăng ký gói (201), điểm danh (201), tạo hóa đơn (201), thanh toán (200), đọc hóa đơn và doanh thu (200).
- Trình duyệt: đăng nhập `duyban246@gmail.com`, dashboard hiện tên Duy và doanh thu từ API; gửi form tạo lớp `Fitness - tạo từ giao diện thật` thành công. SQL xác nhận bản ghi `class_id=2`, `sport_id=2`, `coach_id=2`, `room_id=2`, lịch `2026-10-23T08:00:00`.
- Đọc trực tiếp SQL xác nhận 4 người dùng đúng vai trò, booking BOOKED, subscription ACTIVE, attendance PRESENT, hóa đơn 800.000 VND trạng thái PAID. Đây là dữ liệu thử trong database local mới; không có giao dịch tiền thật.

Bằng chứng tại máy:

- `.local/live-test-results.json`: mã HTTP của 28 yêu cầu.
- `.local/live-test-records.json`: ID các bản ghi thử.
- `.local/tomcat/logs/access_log.2026-10-22.log`: backend ghi nhận các yêu cầu HTTP.
- `.local/backend.log` và `.local/backend-error.log`: log khởi động/runtime.

Chạy lại kiểm tra không tạo dữ liệu:

```powershell
npm run test:api:live
# Thêm API_TEST_EMAIL và API_TEST_PASSWORD nếu cần test tài khoản.
```

## Phạm vi còn phụ thuộc backend

Backend nguyên bản chưa có endpoint quản lý danh mục phòng/bộ môn/gói tập, kế hoạch tập luyện, hỗ trợ và trợ lý AI. Các màn này vẫn hiển thị giới hạn API hiện có; không thể biến chúng thành chức năng đầy đủ chỉ bằng frontend. Form lớp học dùng ID bộ môn/phòng tồn tại trong SQL. Các ID local: bộ môn 1=Yoga, 2=Fitness, 3=Pilates; phòng 1=Yoga, 2=Fitness, 3=Pilates; gói 1=tháng, 2=quý, 3=năm.
