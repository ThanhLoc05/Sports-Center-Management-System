# Sportiva — Hệ thống quản lý trung tâm thể thao

React, TypeScript, Vite ở frontend; Spring Boot, JWT, SQL Server ở backend. Bản chạy kết nối API thật. Tài khoản và dữ liệu mô phỏng trong `src/test/fixtures` chỉ phục vụ kiểm thử, không thay thế dữ liệu SQL khi API lỗi.

## Cấu trúc dự án

- Frontend React/Vite ở root: `package.json`, `vite.config.ts`, `src/pages/`, `src/components/`, `src/lib/` và FE tests trong `src/test/`.
- Backend Spring Boot: `backend/pom.xml`, `backend/src/main/`, `backend/src/test/java/` và Maven Wrapper trong `backend/`.
- Không còn Backend Java hoặc Maven project tại root. Import **`backend/pom.xml`** trong IDE.

## Chuẩn bị và cài frontend

- Node.js **22.12 trở lên**, npm và Git.
- **JDK 27** theo `backend/pom.xml`; không ghi đè `java.version` xuống phiên bản thấp hơn.
- SQL Server đang chạy, cho phép TCP và nghe đúng cổng; SSMS để quản trị database.
- Maven Wrapper đã có sẵn trong `backend/`, không bắt buộc cài Maven riêng.

```powershell
git clone https://github.com/ThanhLoc05/Sports-Center-Management-System.git
cd Sports-Center-Management-System
npm ci
Copy-Item .env.example .env.local
```

**Backend chính thức nằm tại `backend/src/main/java` và dùng `backend/pom.xml`.** Chạy Maven trong `backend/`. Cây Backend trùng lặp ở gốc đã được loại bỏ; Frontend và các FE tests vẫn nằm trong `src/`.

## Chuẩn bị database riêng

Xin nhóm Backend thông tin instance, database riêng và cách xác thực được phép sử dụng. Clone/pull không tạo database hoặc tài khoản. Không mặc định database trên máy khác có cùng tên, schema hoặc dữ liệu.

Database local mặc định là **`SportsCenterDB`**. Schema và dữ liệu demo nằm trong `backend/src/main/resources/db/`; các bảng khớp với entity/backend hiện tại (`users`, `roles`, `membership_packages`, `classes`...), không dùng bộ tên bảng của bản phác thảo `SportsCenterDesign`. Trên database mới, chạy `create-sports-center-sql2019.sql` để tạo database rỗng (script sẽ dừng nếu database đã tồn tại), sau đó chọn `SportsCenterDB` trong SSMS và chạy lần lượt `schema.sql`, `sample-running-data.sql`. Không chạy `schema.sql` hoặc script tạo database trên database có dữ liệu nếu chưa kiểm tra/backup. Hibernate giữ `ddl-auto: validate`; không đổi thành `update` hoặc `create` để che lỗi thiếu bảng/cột.

Trong Windows Services, dịch vụ thường tên `SQL Server (SQLEXPRESS)` hoặc `SQL Server (MSSQLSERVER)`. Mở SSMS không đồng nghĩa dịch vụ SQL Server đã chạy. Cần cấu hình TCP/IP và cổng đúng với `DB_URL`.

## Chạy backend

Mở PowerShell tại gốc repository. Đặt JDK 27 cho terminal hiện tại (thay đường dẫn bằng thư mục đã giải nén), không thay đổi biến môi trường hệ thống:

```powershell
$env:JAVA_HOME = 'C:\Apps\OpenJDK27U-jdk_x64_windows_hotspot_27_35\jdk-27+35'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
java -version
javac -version
Push-Location backend
.\mvnw.cmd -version
Pop-Location
```

Java, javac và Java runtime của Maven phải là 27. Dùng tài khoản SQL của máy; sinh JWT secret riêng cho môi trường local:

```powershell
$env:DB_URL = Read-Host 'JDBC URL của database riêng đã được xác minh'
$env:DB_USERNAME = Read-Host 'Tên đăng nhập SQL Server'
$sqlPassword = Read-Host 'Mật khẩu SQL Server' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $sqlPassword).Password
$jwtBytes = New-Object byte[] 32
$jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$jwtRng.GetBytes($jwtBytes)
$jwtRng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($jwtBytes)
$env:SPRING_JPA_HIBERNATE_DDL_AUTO = 'validate'
$env:SPRING_SQL_INIT_MODE = 'never'
$env:SPRING_FLYWAY_ENABLED = 'false'
$env:SPRING_LIQUIBASE_ENABLED = 'false'
Push-Location backend
.\mvnw.cmd spring-boot:run
Pop-Location
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
DB_URL=<JDBC URL database riêng đã xác minh>
DB_USERNAME=<tài khoản SQL được cấp>
DB_PASSWORD=<chỉ điền trên máy, không commit>
JWT_SECRET=<secret ngẫu nhiên chỉ lưu trên máy>
SPRING_JPA_HIBERNATE_DDL_AUTO=validate
SPRING_SQL_INIT_MODE=never
SPRING_FLYWAY_ENABLED=false
SPRING_LIQUIBASE_ENABLED=false
```

Dùng JWT secret và JAVA_HOME của JDK 27 đã thiết lập ở bước trên. File này bị Git bỏ qua; không commit hoặc chia sẻ giá trị thật. Sau đó chạy:

```powershell
npm run start:local
```

Launcher chỉ chạy Maven wrapper trong `backend/`, kiểm tra JAVA_HOME là JDK 27, ghi log vào `.local/` và khởi động dịch vụ khi cổng chưa được dùng. **Nếu cổng 8080 đang chạy BE cũ, dừng nó trước**: launcher không thay thế tiến trình đang hoạt động. Sau khi launcher trả về dấu nhắc, FE/BE vẫn chạy nền.

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
- Luồng **đăng ký/gia hạn → chọn tiền mặt/chuyển khoản → tạo MembershipOrder và Invoice PENDING → xác nhận thanh toán → kích hoạt gói** có API trong `backend/`. Tiền mặt do nhân viên xác nhận; chuyển khoản được đối soát qua webhook SePay khi được cấu hình. Gói cũ được giữ nguyên khi đơn còn chờ. Xác nhận đơn gói không dùng API thu hóa đơn cũ.
- QR dùng thông tin ngân hàng và khoản thu do Backend trả về. Quét QR không chứng minh tiền đã tới: webhook SePay phải được xác thực và đối soát hợp lệ trước khi tự xác nhận chuyển khoản. `SEPAY_WEBHOOK_ENABLED` và demo payment mặc định tắt; không đưa API key vào Frontend.
- API mode đã nối các API hiện có cho hồ sơ, lớp/booking, gói và checkout, hóa đơn, báo cáo, điểm danh, hỗ trợ, đánh giá, tập luyện và cập nhật danh mục gói/phòng/bộ môn. Nhật ký audit phía server và hệ thống thông báo tổng quát chưa có API; không coi dữ liệu demo hoặc bản nháp giao diện là dữ liệu đã lưu trên SQL.
- Backend kiểm tra quyền và sở hữu tài nguyên. Chặn route/ẩn nút ở FE không thay thế kiểm tra tại BE.

`backend/src/main/resources/db/sample-classes.sql` thêm lớp mẫu cho DB cài mới đã có HLV `ACTIVE`; kiểm tra script trước khi chạy. Lớp được xếp vào các ngày tiếp theo tính từ thời điểm chạy script.

## Trợ lý AI

Luồng: trang Trợ lý tập luyện → `/api/assistant` → hàm server `api/assistant.mjs` → Gemini → FE hiển thị kết quả hoặc lỗi. Key nằm ở server qua **`GEMINI_API_KEY`**, không đưa vào biến `VITE_`.

Vite local hiện proxy `/api/assistant` tới `https://sportiva-demo.vercel.app`, cần Internet và server đã cấu hình. Nếu deploy bản riêng trên Vercel, thêm `GEMINI_API_KEY` trong Environment Variables của project rồi deploy lại. Vite không tự thực thi file serverless này. AI hỗ trợ gợi ý; dữ liệu gói, lịch và hóa đơn vẫn lấy từ API trung tâm.

## Kiểm tra và cập nhật

```powershell
npm run typecheck
npm test
npm test -- --maxWorkers=2
npm run test:ai-server
npm run build
```

Test FE/API mock kiểm tra giao diện và hợp đồng HTTP, không chứng minh SQL Server đã ghi dữ liệu. Kiểm tra thật phải chạy BE/DB, đăng nhập từng vai trò, thao tác rồi đọc lại dữ liệu qua API hoặc SQL.

Kiểm thử và đóng gói Backend bằng JDK 27, từ gốc repository:

```powershell
Push-Location backend
# Unit tests không khởi động Spring context hoặc kết nối database.
.\mvnw.cmd '-Dtest=*Test,!SportsCenterApplicationTests,!SportCenterApplicationTests' test
.\mvnw.cmd '-Dtest=*Test,!SportsCenterApplicationTests,!SportCenterApplicationTests' package
Pop-Location
```

Hai test `SportsCenterApplicationTests` và `SportCenterApplicationTests` dùng `@SpringBootTest`, cần database phù hợp. Chỉ chạy toàn bộ `mvnw.cmd test` trong `backend/` sau khi xác minh DB_URL trỏ đúng database test riêng được duyệt. Không chạy schema/migration để làm test PASS; giữ `ddl-auto: validate`.

Sau khi đã cấu hình và xác minh database test riêng, chạy toàn bộ Backend tests và đóng gói:

```powershell
Push-Location backend
.\mvnw.cmd -B '-Dmssql-jdbc.version=13.6.0.jre11' clean package
Pop-Location
```

Lệnh trên đã được kiểm chứng với Windows Authentication, JDBC 13.6 và thư viện native x64 tương ứng. Nếu dùng Windows Authentication, `DB_URL` phải chứa `integratedSecurity=true`, `DB_USERNAME` và `DB_PASSWORD` đặt chuỗi rỗng; thêm thư mục chứa `mssql-jdbc_auth-13.6.0.x64.dll` vào PATH của terminal. Dùng đúng instance/database do nhóm xác nhận. Không tự chuyển cơ chế xác thực khi kết nối lỗi. Lệnh chạy tương ứng trong `backend/` là `.\mvnw.cmd -B '-Dmssql-jdbc.version=13.6.0.jre11' spring-boot:run`.

## Hướng dẫn cho thành viên sau khi pull code mới

1. Kiểm tra `git status`; bảo toàn thay đổi local trước khi cập nhật. Chỉ dùng `git pull --ff-only origin main` khi đang ở `main` và lịch sử cho phép fast-forward; nếu bị từ chối, dừng để nhóm thống nhất, không reset hoặc ghi đè code.
2. Cấu hình JAVA_HOME cho terminal như trên; kiểm tra Java, javac và Maven đều dùng JDK 27.
3. Import `backend/pom.xml` trong IDE; bỏ lựa chọn Maven project gốc đã không còn tồn tại.
4. Xin và xác minh database riêng, schema và cách xác thực với nhóm Backend; cấu hình biến môi trường, không đưa credential vào Git.
5. Chạy `npm ci` tại root. Nếu đã có `.env.local`, giữ cấu hình riêng; chỉ sao chép `.env.example` khi chưa có file.
6. Chạy Backend trong `backend/`, chờ thông báo khởi động thành công và Hibernate validate không lỗi.
7. Mở terminal thứ hai, chạy Frontend tại root theo hướng dẫn trên. Backend mặc định `localhost:8080`, Frontend `localhost:5173`; các lệnh dùng địa chỉ loopback `127.0.0.1`.
8. Kiểm tra GET trực tiếp và qua proxy, không tạo dữ liệu:

```powershell
Invoke-WebRequest http://127.0.0.1:8080/api/v1/classes -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:5173/api/v1/classes -UseBasicParsing
```

Cả hai phải trả HTTP 200 và cùng dữ liệu JSON. API cần JWT vẫn trả 401 nếu chưa đăng nhập; điều này không chứng minh proxy lỗi. Tài khoản phải được nhóm bàn giao riêng, không suy ra từ fixture.

Trước khi lấy code mới, xem `git status`, commit hoặc sao lưu thay đổi cần giữ:

```powershell
git switch main
git pull --ff-only origin main
npm ci
```

| Lỗi                                    | Kiểm tra                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Máy chủ lỗi, không đăng nhập           | BE đã khởi động chưa; SQL/DB và proxy có đúng không; xem terminal BE hoặc `.local/backend.*.log` |
| Sai Java version / invalid target release | Kiểm tra `java -version`, `javac -version`, `backend\mvnw.cmd -version`; sửa JAVA_HOME/PATH của terminal về JDK 27, không hạ `java.version` |
| Không kết nối SQL Server              | Xác nhận instance, database, TCP/cổng và cách xác thực trong DB_URL; Windows Authentication cần đúng DLL x64/JDBC; không tự chuyển database |
| Frontend không gọi được API           | Kiểm tra GET trực tiếp cổng 8080 rồi qua 5173, API_PROXY_TARGET và VITE_API_BASE_URL; khởi động lại Vite sau khi đổi env |
| Hibernate thiếu bảng/cột               | DB khác phiên bản model; thống nhất migration, không đổi `ddl-auto` để che lỗi                   |
| 401                                    | Đăng nhập lại, JWT có thể hết hạn hoặc đổi secret                                                |
| 403                                    | Vai trò và quyền trên tài nguyên đang thao tác                                                   |
| 404/405 khi gia hạn chờ thu            | Kiểm tra schema phù hợp, đúng Backend trong `backend/` và đúng phiên bản frontend chưa          |
| Cổng 8080/5173 bị chiếm                | Xác định tiến trình đang chạy trước khi dừng hoặc đổi cổng                                       |
| Vercel mở được nhưng dữ liệu không tải | BE local không phải URL công khai; deploy cần BE online/proxy phù hợp                            |

Git chỉ chứa source, kiểm thử, cấu hình mẫu và README. Không đưa mật khẩu, API key/JWT secret, `.env` thật, `.local/`, log, báo cáo cá nhân, ảnh chụp kiểm thử, `node_modules/` hoặc `dist/` lên Git.
