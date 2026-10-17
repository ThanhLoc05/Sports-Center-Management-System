# Triển khai và vận hành

## Phân biệt frontend build và readiness của hệ thống

`npm run build` tạo SPA production ở `dist`. Không có backend runtime, database, email, AI hay payment provider trong output này. Trước release phải xử lý các blocker nêu ở `AUDIT.md`, có backend/DB thật và chạy nghiệm thu đủ 4 vai trò. Không dùng demo data làm production data.

## Build cho API thực

```bash
VITE_DATA_MODE=api VITE_API_BASE_URL= npm run build
```

Biến `VITE_*` được nhúng lúc build, không đổi sau khi đưa dist lên server. `.env` chỉ phục vụ local và nằm trong .gitignore. Không đưa JWT secret, database password hay AI provider key vào VITE env.

- Dùng HTTPS reverse proxy. Giữ frontend và `/api` cùng origin để không phải mở CORS rộng.
- Fallback SPA: URL như `/members` phải trả `index.html`; `/api` và asset không được trả SPA khi lỗi.
- Cache asset có hash lâu; không cache `index.html` lâu. Bật gzip/Brotli ở edge/server nếu có.
- CSP/header mẫu ở `deploy/default.conf.template`; `style-src unsafe-inline` dùng cho inline sizing của calendar/Recharts, `script-src` vẫn chỉ self.
- Không có source map production, không log token hoặc dữ liệu cá nhân.
- Với cross-origin API phải cấu hình CORS chính xác ở BE và thêm origin được phép vào `connect-src`; mẫu mặc định chỉ dành cho same-origin.

## Docker + Nginx (cấu hình đã chuẩn bị, chưa build Docker trên máy này)

```bash
docker build -t sportiva-frontend .
docker run --rm -p 3000:80 \
  -e BACKEND_UPSTREAM=http://host.docker.internal:8080 \
  sportiva-frontend
```

Docker mặc định build `VITE_DATA_MODE=api`. Hostname `host.docker.internal` phù hợp Docker Desktop local. Môi trường thật thay bằng upstream backend trong mạng nội bộ (ví dụ `http://backend:8080`), cấu hình TLS ở reverse proxy bên ngoài và version-pin image theo chính sách triển khai của đội. Không publish cổng database.

Để container demo riêng:

```bash
docker build --build-arg VITE_DATA_MODE=demo -t sportiva-demo .
```

Nginx template dùng cơ chế envsubst chuẩn của image, chỉ `${BACKEND_UPSTREAM}` là biến môi trường; biến Nginx `$uri`, `$proxy_host`, `$scheme` được giữ nguyên.

## Xác thực

JWT access token trong sessionStorage, không cookie/refresh vì BE chưa có contract tương ứng. Token hết hạn hoặc 401 thì đăng xuất, xóa query cache. Khi đổi tài khoản/role demo, cache cũng được xóa. Đăng xuất client không thu hồi JWT trên server. Production nên thống nhất cơ chế session/refresh/revoke với BE; không thể bảo đảm thu hồi chỉ bằng FE.

## Checklist nghiệm thu với BE thật

1. Migration đúng entity, seed roles/sports/rooms/packages, tạo bốn tài khoản test hợp lệ; không dùng secret fallback.
2. Login từng role, token hết hạn, sai credentials, 403 và truy cập trực tiếp URL trái quyền.
3. Manager tạo/sửa/hủy lớp, kiểm tra chồng lịch và capacity; coach chỉ thao tác lớp phụ trách.
4. Member và lễ tân book/cancel/gia hạn; kiểm tra owner, membership, duplicate và booking cạnh tranh.
5. Invoice PENDING→PAID→REFUNDED đúng quyền, không thanh toán hai lần, không đổi amount tùy ý, không đọc hóa đơn người khác.
6. Attendance duplicate, lớp phụ trách, thời gian, danh sách booking; member chỉ đọc lịch sử bản thân.
7. Doanh thu có đối soát với DB, timezone GMT+7, mốc đầu/cuối ngày, hoàn tiền và paidAt.
8. Refresh deep-link, mobile, keyboard, proxy/CORS, lỗi mạng/5xx, timeout, monitoring không lộ PII.

Kết quả chưa được xác minh với BE thật phải được giữ là “chưa xác minh”, không coi test mock/demo là E2E production.
