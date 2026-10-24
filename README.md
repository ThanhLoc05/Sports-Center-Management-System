# Sportiva · Sports Center Management System

> Kết nối API local đã được kiểm thử: [URL, tài khoản và bằng chứng backend nhận dữ liệu](docs/API-LIVE-TEST.md).

> **Người nhận bàn giao:** đọc [Hướng dẫn khởi động và sử dụng](HUONG-DAN-BAN-GIAO.md) hoặc mở `HUONG-DAN-BAN-GIAO.html` bằng trình duyệt.

Frontend quản lý trung tâm thể thao bằng React + TypeScript, giao diện tiếng Việt cho **Center Manager, Coach, Member và Receptionist**. Toàn bộ công việc được giữ local, không push/deploy.

## Chạy ngay

Yêu cầu: Node.js 22.12+ hoặc 24 LTS, npm.

```bash
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173**. Frontend mặc định gọi backend thật qua `/api`, proxy tới `http://127.0.0.1:8080`. Backend phải đang hoạt động và có database hợp lệ. Đăng nhập bằng tài khoản backend; phiên demo cũ không được sử dụng trong chế độ API. Nếu port bận, dùng URL Vite in ra.

Muốn xem riêng bản demo, đặt `VITE_DATA_MODE=demo` trong `.env` rồi khởi động lại Vite.

Tài khoản demo dùng mật khẩu chung `Sportiva@123`:

| Vai trò    | Email                   |
| ---------- | ----------------------- |
| Quản lý    | manager@sportiva.demo   |
| HLV        | coach1@sportiva.demo    |
| Thành viên | member1@sportiva.demo   |
| Lễ tân     | reception@sportiva.demo |

Đổi vai trò ở menu ảnh đại diện. Khôi phục demo ở **Cài đặt → Dữ liệu demo**. Không đưa dữ liệu cá nhân thật vào demo. Tài khoản đăng ký trong demo cũng dùng mật khẩu chung; mật khẩu nhập ở form không được lưu.

## Kết nối backend thật

```bash
cp .env.example .env
```

Sửa `.env`:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=
API_PROXY_TARGET=http://127.0.0.1:8080
```

Khởi động lại `npm run dev`. `/api` đi qua Vite proxy, tránh CORS khi phát triển. Đăng nhập bằng tài khoản đã tạo/seed ở DB; nút đổi vai trò demo không xuất hiện trong chế độ API. `VITE_API_BASE_URL` là **origin backend, không bao gồm `/api/v1`**; để trống nếu dùng cùng origin qua proxy. Không đặt secret/API key trong biến `VITE_*`.

Backend gốc ở `backend/`, yêu cầu JDK 23 và SQL Server. Đọc `backend/README.md` và **[docs/AUDIT.md](docs/AUDIT.md)** trước khi chạy: script SQL hiện có **không khớp JPA entities** và không có Flyway dependency để chạy migration tự động. Không chạy script đó lên DB production. Frontend ưu tiên contract từ **Java DTO/controller nhánh BE**, vì SwaggerHub hiện đã lệch nhiều trường.

## Chức năng

- Tổng quan riêng theo vai trò, tìm kiếm nhanh, thông báo gói sắp hết hạn trong demo.
- Thành viên, đội ngũ, xem hồ sơ, tạo thành viên và bật/tắt trạng thái tài khoản.
- Tạo/sửa/hủy lớp, phân công HLV/phòng/bộ môn, sức chứa, lịch tuần và danh sách.
- Đăng ký/hủy lớp; đăng ký/gia hạn/hủy gói thành viên.
- Điểm danh theo lớp, lịch sử theo thành viên, xuất CSV.
- Tạo hóa đơn chờ thu, xác nhận thanh toán, hoàn tiền, phiếu thu in/lưu PDF và CSV.
- Báo cáo doanh thu theo khoảng ngày, phương thức thanh toán.
- Kế hoạch, kết quả và nhận xét HLV; trợ lý theo quy tắc; hỗ trợ; audit log; danh mục phòng/bộ môn: **demo local khi chưa có controller BE**.
- Responsive, keyboard navigation, focus trap cho dialog, thông báo lỗi, trạng thái tải/trống, font tiếng Việt phục vụ local.

Các màn thiếu API hiển thị rõ trạng thái và không tự tạo dữ liệu giả trong API mode. API lỗi không chuyển sang demo. Biểu đồ ngày và số liệu tổng không có endpoint sẽ không được suy đoán.

## Kiểm tra và build

```bash
npm run typecheck
npm test
npm run build
npm run preview
npm run format:check
```

`dist/` là output production. Các route được lazy-load, chart tách thành chunk riêng. Unit/integration tests kiểm tra contract BE, quyền sở hữu, lỗi API, nghiệp vụ demo và UI. Browser QA được ghi ở **[docs/QA.md](docs/QA.md)**.

```bash
npm run api:types
```

Sinh lại type tham khảo của **Swagger gốc** từ `docs/openapi.json`. Không thay thế `src/lib/types.ts` bằng schema Swagger cũ; schema actual BE được ghi ở `docs/API-CONTRACT.md`.

## Cấu trúc

```text
src/
  components/     Shell, bảng dữ liệu, form, dialog, toast
  lib/            Types BE, fetch client, auth, hooks, dữ liệu demo, thời gian GMT+7
  pages/          Các màn theo module nghiệp vụ
  test/           Vitest + React Testing Library
backend/          Snapshot nguyên vẹn nhánh BE
reference/frontend/  Snapshot nguyên vẹn nhánh FE trước khi nâng cấp
public/           Favicon thương hiệu
deploy/           Nginx config để triển khai SPA và proxy API
docs/            Audit, contract, QA, hướng dẫn triển khai
```

Git local ở nhánh `codex/sportiva-frontend`, dựa trên `origin/FE`. Các remote ref `origin/BE`, `origin/FE`, `origin/Testing`, `origin/main` và lịch sử đã được lấy về. Thay đổi đang để local để review; không push.

## Production

Xem **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**. Frontend build được, nhưng toàn hệ thống **chưa thể được xác nhận production ready** khi chưa xử lý các blocker BE về schema, phân quyền tài nguyên, API còn thiếu và chưa kiểm thử với backend/database thật. Danh sách cụ thể, bằng chứng và phạm vi xác minh nằm trong audit.

## Kiểm tra frontend gửi được tới backend thật

Giữ backend đang chạy, chạy `npm run dev` ở một terminal, rồi ở terminal khác:

```powershell
npm run test:api:live
```

Lệnh gửi dữ liệu đăng nhập không hợp lệ qua frontend proxy và yêu cầu backend trả HTTP 400; tiếp theo kiểm tra endpoint bảo vệ từ chối yêu cầu chưa đăng nhập. Đây là phép thử kết nối thật, không mock và không tạo dữ liệu. Backend tắt, proxy lỗi hoặc trả HTML đều khiến lệnh thất bại.

Để kiểm tra đăng nhập, đọc hồ sơ và danh sách lớp với tài khoản thật:

```powershell
$env:API_TEST_EMAIL = "email-tai-khoan-test"
$env:API_TEST_PASSWORD = "mat-khau-tai-khoan-test"
npm run test:api:live
```

Mặc định kiểm tra qua `http://127.0.0.1:5173`; dùng `API_TEST_FRONTEND_URL` nếu Vite chạy cổng khác. Lệnh kiểm tra không in mật khẩu hay JWT. Các module backend chưa có endpoint vẫn hiển thị trạng thái chưa hỗ trợ. Không sửa file trong `backend/`; database local được tạo đúng cấu trúc JPA hiện có.

Chạy backend với Java 17 hiện có, dùng các biến môi trường local trong `.env.backend.local` (file bị Git bỏ qua):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-backend-local.ps1
```

Sau đó chạy frontend ở terminal khác bằng `npm run dev`. Thông tin tài khoản local được lưu ở `.local/accounts.json`; log backend ở `.local/backend.log`, log yêu cầu HTTP ở `.local/tomcat/logs/`.
