# Sportiva — Hệ thống quản lý trung tâm thể thao

React, TypeScript, Vite ở frontend; Spring Boot, JWT, SQL Server ở backend. Bản chạy kết nối API thật. Tài khoản và dữ liệu mô phỏng trong `src/test/fixtures` chỉ phục vụ kiểm thử, không thay thế dữ liệu SQL khi API lỗi.

## Chuẩn bị và cài frontend

- Node.js **22.12 trở lên**, npm và Git.
- **JDK 23** theo `pom.xml`; máy dùng JDK 17 có thể truyền `-Djava.version=17` khi chạy Maven như hướng dẫn dưới.
- SQL Server đang chạy, cho phép TCP và nghe đúng cổng; SSMS để quản trị database.
- Maven Wrapper đã có sẵn, không bắt buộc cài Maven riêng.

```powershell
git clone https://github.com/ThanhLoc05/Sports-Center-Management-System.git
cd Sports-Center-Management-System
npm ci
Copy-Item .env.example .env.local
```

**Backend mới nằm tại `src/main/java` và dùng `pom.xml` ở thư mục gốc.** Chạy lệnh Maven tại gốc. Thư mục `backend/` là bản cũ được giữ lại; không dùng nó để chạy bản mới.

## Tạo database

Với máy chưa có dữ liệu, mở SSMS và tạo database trống:

```sql
CREATE DATABASE SportsCenterDB;
GO
USE SportsCenterDB;
GO
```

Sau đó mở `src/main/resources/db/schema.sql`, chọn database `SportsCenterDB` và chạy. Script tạo bảng, ràng buộc và danh mục cơ bản, gồm bốn vai trò `CENTER_MANAGER`, `COACH`, `RECEPTIONIST`, `MEMBER`.

Database đã có dữ liệu cần sao lưu và đối chiếu cấu trúc với backend mới trước khi cập nhật. `schema.sql` dành cho cài mới, không tự chuyển đổi bảng cũ; Hibernate dùng `ddl-auto: validate`. **Không dùng `recreate-sports-center-sql2019.sql` để cập nhật DB đang dùng: file đó xóa toàn bộ database.**

Các script trong `src/main/resources/db/migration/` chạy thủ công khi cần: V3 tạo phiếu hỗ trợ, V4 thêm chi tiết kết quả tập luyện, V5 chuyển vai trò `MANAGER` cũ sang `CENTER_MANAGER`. V4 yêu cầu bảng `workout_logs` đã tồn tại. Xem `docs/DATABASE-DESIGN.md` và thống nhất migration với nhóm BE trước khi đổi DB có dữ liệu.

Trong Windows Services, dịch vụ thường tên `SQL Server (SQLEXPRESS)` hoặc `SQL Server (MSSQLSERVER)`. Mở SSMS không đồng nghĩa dịch vụ SQL Server đã chạy. Cần cấu hình TCP/IP và cổng đúng với `DB_URL`.

## Chạy backend

Mở PowerShell tại gốc repository. Dùng tài khoản SQL của máy; sinh JWT secret riêng cho môi trường local:

```powershell
$env:DB_URL = 'jdbc:sqlserver://localhost:1433;databaseName=SportsCenterDB;encrypt=true;trustServerCertificate=true;'
$env:DB_USERNAME = Read-Host 'Tên đăng nhập SQL Server'
$sqlPassword = Read-Host 'Mật khẩu SQL Server' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $sqlPassword).Password
$jwtBytes = New-Object byte[] 32
$jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$jwtRng.GetBytes($jwtBytes)
$jwtRng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($jwtBytes)
.\mvnw.cmd spring-boot:run
```

Nếu máy chỉ có JDK 17, dùng lệnh sau thay cho lệnh Maven cuối cùng, không cần sửa `pom.xml`:

```powershell
.\mvnw.cmd '-Djava.version=17' spring-boot:run
```

Giữ terminal mở, chờ thông báo ứng dụng khởi động thành công. Backend mặc định ở **http://127.0.0.1:8080**, tiền tố API `/api/v1`. Có thể đổi `SERVER_PORT`; `JWT_EXPIRATION_MS` mặc định một giờ. `trustServerCertificate=true` trong ví dụ dành cho local.

## Chạy frontend

Mở terminal thứ hai tại gốc:

```powershell
npm run dev -- --port 5173 --strictPort
```

Truy cập **http://127.0.0.1:5173**. `.env.local` dùng cấu hình:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=
API_PROXY_TARGET=http://127.0.0.1:8080
```

Để trống `VITE_API_BASE_URL` giúp Vite chuyển tiếp `/api/v1` sang BE. Nếu đặt URL, chỉ điền origin, không thêm `/api/v1`. Khởi động lại Vite sau khi đổi env. Biến `VITE_` được đưa vào trình duyệt, không được chứa secret.

### Khởi động gộp trên Windows

`npm run start:local` dùng SQL Server local nghe cổng 1433. Tạo file **`.env.backend.local`** tại gốc và tự điền cấu hình máy:

```dotenv
DB_URL=jdbc:sqlserver://localhost:1433;databaseName=SportsCenterDB;encrypt=true;trustServerCertificate=true;
DB_USERNAME=ten_sql_cua_ban
DB_PASSWORD=mat_khau_sql_cua_ban
JWT_SECRET=chuoi_base64_ngau_nhien_toi_thieu_32_byte
LOCAL_JAVA_VERSION=17
```

Dùng JWT secret đã sinh ở bước trên. Máy có JDK 23 có thể đặt `LOCAL_JAVA_VERSION=23`. File này bị Git bỏ qua; không commit hoặc chia sẻ giá trị thật. Sau đó chạy:

```powershell
npm run start:local
```

Launcher ưu tiên BE ở gốc, ghi log vào `.local/` và khởi động dịch vụ khi cổng chưa được dùng. **Nếu cổng 8080 đang chạy BE cũ, dừng nó trước**: launcher không thay thế tiến trình đang hoạt động. Sau khi launcher trả về dấu nhắc, FE/BE vẫn chạy nền.

Với hai terminal riêng, dùng **Ctrl+C** ở từng terminal để dừng. Với launcher, dừng tiến trình đang nghe cổng 8080 bằng PowerShell:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ }
```

Lệnh dừng tiến trình dùng cổng đó; đổi sang 5173 để dừng FE.

## Tài khoản đã tạo để trình bày

Các tài khoản sau thuộc **database local trên máy trình bày**. Clone hoặc pull Git không sao chép database, không tự tạo tài khoản trên máy khác.

| Vai trò            | Email                                 | Mục đích                                     |
| ------------------ | ------------------------------------- | -------------------------------------------- |
| Quản lý trung tâm  | `duyban246@gmail.com`                 | Đội ngũ, gán vai trò, quản lý lớp, báo cáo   |
| Huấn luyện viên    | `coach@sportiva.local`                | Lịch dạy, lớp phụ trách, điểm danh           |
| Lễ tân             | `reception@sportiva.local`            | Hỗ trợ thành viên, đăng ký lớp/gói, thu tiền |
| Thành viên         | `member@sportiva.local`               | Gói cá nhân, lớp, hóa đơn, lịch sử điểm danh |
| Thành viên bổ sung | `trinhbay.1793111588011@example.test` | Kịch bản chuẩn bị riêng trên máy trình bày   |

**Mật khẩu bàn giao riêng**, không ghi trong Git. Máy trình bày có file `.local/TAI-KHOAN-TRINH-BAY.md` chứa thông tin đăng nhập, đã bị loại khỏi Git. Mật khẩu của fixture kiểm thử không dùng để đăng nhập BE thật.

Với database mới: đăng ký qua `/register` tạo tài khoản `MEMBER`. Người quản trị DB đăng ký tài khoản tin cậy rồi cập nhật `users.role_id` sang role `CENTER_MANAGER` trong bảng `roles` để tạo quản lý đầu tiên, theo quy trình nhóm BE. Đăng ký công khai không được tự chọn vai trò đặc quyền.

Sau khi có quản lý, dùng **Đội ngũ → chi tiết tài khoản → Vai trò**, ở dưới Email. Nếu tài khoản mới vẫn là MEMBER và chưa có trong danh sách đội ngũ, quản lý có thể gọi `PATCH /api/v1/users/{id}/role?roleName=COACH` bằng JWT quản lý, hoặc nhờ người quản trị DB thiết lập đúng vai trò. Đăng nhập lại tài khoản sau khi đổi vai trò để lấy JWT mới.

Quyền theo vai trò là cố định. URL cũ `/permissions` chuyển về `/team`, không còn trang thêm/gỡ quyền lẻ.

## Phạm vi và các API còn chờ

FE có các trang thành viên/đội ngũ, lớp/lịch, booking, gói tập, hóa đơn/QR, điểm danh, tổng quan/báo cáo, tập luyện, thông báo/hỗ trợ, nhật ký và AI. Có giao diện không đồng nghĩa mọi thao tác đã có API thật.

- FE đang gọi các API xác thực, tài khoản, trạng thái/vai trò, danh mục phòng/bộ môn để chọn lớp, lớp/lịch HLV, booking, gói đã đăng ký, hóa đơn, thu tiền, điểm danh, doanh thu.
- Luồng mới **đăng ký/gia hạn → chọn tiền mặt/chuyển khoản → hóa đơn chờ thu → xác nhận rồi kích hoạt gói** có FE theo hợp đồng `/membership-packages` và `/membership-orders`. BE trong Git hiện **chưa triển khai những endpoint này**. FE báo chưa hỗ trợ, không gọi API gia hạn ngay để giả thành công.
- QR thật cần cấu hình ngân hàng, số tài khoản, chủ tài khoản trong Cài đặt. QR chứa tiền và nội dung đối soát hóa đơn/thành viên. Quét QR không chứng minh tiền đã tới; tự xác nhận cần webhook ngân hàng hoặc nhà cung cấp thanh toán ở BE.
- Một số màn tập luyện, hỗ trợ, thông báo, nhật ký, chỉnh danh mục vẫn theo hợp đồng FE cũ và chưa nối các controller mới. API mode khóa hoặc báo các thao tác chưa hỗ trợ; cần đối chiếu DTO để nối tiếp, không trình bày các phần đó như đã hoạt động với SQL.
- Backend kiểm tra quyền và sở hữu tài nguyên. Chặn route/ẩn nút ở FE không thay thế kiểm tra tại BE.

`src/main/resources/db/sample-classes.sql` thêm lớp mẫu cho DB cài mới đã có HLV `ACTIVE`; kiểm tra script trước khi chạy. Lớp được xếp vào các ngày tiếp theo tính từ thời điểm chạy script.

## Trợ lý AI

Luồng: trang Trợ lý tập luyện → `/api/assistant` → hàm server `api/assistant.mjs` → Gemini → FE hiển thị kết quả hoặc lỗi. Key nằm ở server qua **`GEMINI_API_KEY`**, không đưa vào biến `VITE_`.

Vite local hiện proxy `/api/assistant` tới `https://sportiva-demo.vercel.app`, cần Internet và server đã cấu hình. Nếu deploy bản riêng trên Vercel, thêm `GEMINI_API_KEY` trong Environment Variables của project rồi deploy lại. Vite không tự thực thi file serverless này. AI hỗ trợ gợi ý; dữ liệu gói, lịch và hóa đơn vẫn lấy từ API trung tâm.

## Kiểm tra và cập nhật

```powershell
npm run typecheck
npm test
npm run test:ai-server
npm run build
```

Test FE/API mock kiểm tra giao diện và hợp đồng HTTP, không chứng minh SQL Server đã ghi dữ liệu. Kiểm tra thật phải chạy BE/DB, đăng nhập từng vai trò, thao tác rồi đọc lại dữ liệu qua API hoặc SQL.

Biên dịch BE mà chưa khởi động database, với JDK 17:

```powershell
.\mvnw.cmd '-Djava.version=17' -DskipTests compile
```

Trước khi lấy code mới, xem `git status`, commit hoặc sao lưu thay đổi cần giữ:

```powershell
git switch main
git pull --ff-only origin main
npm ci
```

| Lỗi                                    | Kiểm tra                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Máy chủ lỗi, không đăng nhập           | BE đã khởi động chưa; SQL/DB và proxy có đúng không; xem terminal BE hoặc `.local/backend.*.log` |
| Hibernate thiếu bảng/cột               | DB khác phiên bản model; thống nhất migration, không đổi `ddl-auto` để che lỗi                   |
| 401                                    | Đăng nhập lại, JWT có thể hết hạn hoặc đổi secret                                                |
| 403                                    | Vai trò và quyền trên tài nguyên đang thao tác                                                   |
| 404/405 khi gia hạn chờ thu            | Hợp đồng mới chưa có BE, gói chưa được gia hạn                                                   |
| Cổng 8080/5173 bị chiếm                | Xác định tiến trình đang chạy trước khi dừng hoặc đổi cổng                                       |
| Vercel mở được nhưng dữ liệu không tải | BE local không phải URL công khai; deploy cần BE online/proxy phù hợp                            |

Git chỉ chứa source, kiểm thử, cấu hình mẫu và README. Không đưa mật khẩu, API key/JWT secret, `.env` thật, `.local/`, log, báo cáo cá nhân, ảnh chụp kiểm thử, `node_modules/` hoặc `dist/` lên Git.
