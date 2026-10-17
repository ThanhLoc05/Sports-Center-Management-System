# Sportiva — Hướng dẫn khởi động và sử dụng khi bàn giao

Bản bàn giao ngày **15/10/2026** · Sports Center Management System.

**Đọc trước:** để mở giao diện và xem thử, chỉ cần Node.js + npm. Chế độ demo chạy được mà không cần Java, SQL Server hay tài khoản backend. Source frontend mới nằm ngay thư mục gốc có `package.json`; không chạy nhầm trong `backend/` hoặc `reference/frontend/`.

## 1. File bàn giao có gì?

- `src/`, `public/`, các file cấu hình và `package-lock.json`: toàn bộ frontend mới.
- `backend/`: source backend từ nhánh BE, được giữ nguyên để tiếp tục phát triển.
- `reference/frontend/`: frontend cũ để đối chiếu, không phải bản cần chạy.
- `dist/`: bản build frontend demo đi kèm; có thể build lại từ source.
- `docs/`: audit BE/API, contract, kết quả kiểm thử, hướng dẫn triển khai và ảnh giao diện.
- `.env.example`: cấu hình mẫu, có trong ZIP dù là file ẩn.
- `git-history/upstream.bundle`: bản sao lịch sử Git và các ref đã lấy về; được thêm vào ZIP để lưu trữ.
- `PACKAGE-MANIFEST.json`: danh sách file cùng SHA-256 để kiểm tra nội dung gói.
- `HUONG-DAN-BAN-GIAO.html`: cùng hướng dẫn này, mở bằng trình duyệt để đọc/in.

ZIP không chứa `node_modules`, `.git` đang làm việc, cache, file `.env` riêng hoặc dữ liệu trình duyệt. Các thay đổi FE mới chưa commit được đóng gói trực tiếp trong source của ZIP; Git bundle chỉ chứa lịch sử đã commit. **Không checkout/reset theo bundle lên source bàn giao**, vì có thể ghi đè FE mới.

## 2. Khởi động nhanh để xem giao diện

### Bước 1 — Chuẩn bị

1. Giải nén ZIP ra một thư mục bình thường trên máy, không chạy bên trong cửa sổ xem file ZIP.
2. Cài Node.js có kèm npm. Project yêu cầu Node.js **22.12 trở lên**; môi trường đã kiểm thử là **Node.js 24.14.1**.
3. Mở thư mục `Sports-Center-Management-System` vừa giải nén bằng VS Code, chọn **Terminal → New Terminal**; hoặc mở Terminal/PowerShell tại thư mục này.
4. Kiểm tra công cụ:

```bash
node -v
npm -v
```

Thư mục terminal phải là nơi có `package.json`, `src/`, `backend/` và file hướng dẫn này. Nếu giải nén tạo hai tầng thư mục, đi vào tầng trong có `package.json`.

### Bước 2 — Cài dependency (lần đầu)

```bash
npm ci
```

Lệnh cần Internet để tải đúng các phiên bản trong `package-lock.json`. Chờ cài xong, không đóng terminal giữa chừng. Chạy lại khi đổi máy hoặc dependency thay đổi; không cần cài lại mỗi lần mở ứng dụng.

### Bước 3 — Chạy frontend

```bash
npm run dev
```

Mở **http://127.0.0.1:5173/** trên máy đang chạy lệnh. Nếu Vite báo port khác vì port 5173 đã bận, mở đúng dòng **Local** do terminal in ra.

Giữ terminal chạy trong khi sử dụng. Dừng bằng **Ctrl+C**. Những lần khởi động sau chỉ cần mở đúng thư mục rồi chạy `npm run dev`.

**Mặc định là demo**, không cần tạo `.env`. Nếu thư mục đã có cấu hình API từ trước và muốn trở về demo, đặt `VITE_DATA_MODE=demo` trong `.env`, sau đó dừng và chạy lại Vite.

### Riêng Windows PowerShell

Các lệnh trên dùng được trên Windows. Nếu PowerShell báo `npm.ps1 cannot be loaded`, dùng executable npm tương ứng, không cần thay chính sách bảo mật của máy:

```powershell
npm.cmd ci
npm.cmd run dev
```

### Xem bản build đi kèm

Sau khi đã `npm ci`, có thể chạy:

```bash
npm run preview
```

Mở **http://127.0.0.1:4173/** hoặc URL Vite in ra. Bản `dist/` đi kèm được build ở chế độ demo. Không mở `dist/index.html` bằng cách nhấp đúp: ứng dụng cần HTTP server để tải module và điều hướng đúng.

## 3. Đăng nhập và chọn vai trò

Cách nhanh nhất: tại trang đăng nhập, chọn một trong bốn nút trong phần **Khám phá bản demo**.

| Vai trò           | Tài khoản demo          | Mật khẩu     |
| ----------------- | ----------------------- | ------------ |
| Quản lý trung tâm | manager@sportiva.demo   | Sportiva@123 |
| Huấn luyện viên   | coach1@sportiva.demo    | Sportiva@123 |
| Thành viên        | member1@sportiva.demo   | Sportiva@123 |
| Nhân viên lễ tân  | reception@sportiva.demo | Sportiva@123 |

Đổi vai trò bằng **ảnh đại diện ở góc phải trên → Trải nghiệm vai trò**. Nút **Đăng xuất** nằm trong cùng menu. Ở API mode, đăng nhập bằng tài khoản backend thật và không có chức năng đổi vai trò demo.

## 4. Hướng dẫn sử dụng theo vai trò

### Quản lý trung tâm

- **Tổng quan:** xem chỉ số, doanh thu demo, lớp trong ngày và thao tác nhanh.
- **Thành viên:** tìm tên/email/điện thoại, lọc trạng thái, thêm thành viên, mở chi tiết và đổi trạng thái hoạt động.
- **Đội ngũ:** xem HLV/nhân viên và trạng thái tài khoản. Tạo nhân viên/cấp vai trò còn thiếu API BE.
- **Bộ môn & phòng tập:** thêm/sửa danh mục demo, quản lý sức chứa phòng. Danh mục được dùng trong form tạo lớp demo.
- **Lớp học:** tạo lớp, chọn bộ môn/phòng/HLV, ngày giờ tương lai, thời lượng và sức chứa; sửa hoặc hủy lớp.
- **Lịch hoạt động:** xem tuần hoặc danh sách, chuyển tuần và lọc bộ môn; bấm một lớp để xem chi tiết.
- **Đăng ký lớp:** đăng ký hộ thành viên, lọc theo lớp/thành viên, hủy đăng ký.
- **Gói thành viên:** chọn thành viên rồi đăng ký/gia hạn/hủy gói, xem lịch sử.
- **Thanh toán:** tạo hóa đơn, thu tiền, xem/in phiếu thu, xuất CSV và ghi nhận hoàn tiền.
- **Báo cáo:** chọn khoảng ngày, xem doanh thu và phương thức thanh toán; xuất CSV.
- **Nhật ký hoạt động:** xem các thao tác demo trên trình duyệt.

### Nhân viên lễ tân

Chọn vai trò **Nhân viên lễ tân** để tiếp nhận thành viên mới, hỗ trợ đăng ký/gia hạn gói, booking, điểm danh, lập hóa đơn và ghi nhận thanh toán. Lễ tân không có báo cáo doanh thu hoặc quyền hoàn tiền.

Trong API mode, BE hiện chưa cho lễ tân tìm danh sách/đọc hồ sơ thành viên khác. FE cung cấp form nhập **ID thành viên** cho các thao tác mà BE cho phép. Xem `docs/AUDIT.md` để phối hợp bổ sung quyền/API với nhóm BE.

### Huấn luyện viên

- **Lớp học / Lịch hoạt động:** xem các lớp được phân công và danh sách đăng ký.
- **Điểm danh:** chọn lớp rồi ghi Có mặt/Vắng cho học viên.
- **Kế hoạch tập luyện:** tạo kế hoạch cá nhân, ghi bài tập và hướng dẫn/bài tập về nhà; mở kế hoạch để ghi kết quả, đánh giá và nhận xét.
- Module kế hoạch/kết quả đang lưu demo local vì BE chưa có controller tương ứng.

### Thành viên

- Xem **Gói thành viên**, đăng ký/gia hạn và theo dõi hạn sử dụng.
- Vào **Lớp học**, chọn lớp còn chỗ, mở chi tiết rồi đăng ký.
- Theo dõi **Lịch hoạt động / Đăng ký lớp**; hủy đăng ký trong danh sách khi cần.
- Xem **Điểm danh**, kế hoạch và nhận xét của HLV, hóa đơn của mình.
- Dùng **Trợ lý tập luyện** để tra lịch/gói demo hoặc tạo mẫu bài tập theo quy tắc; gửi nội dung cần hỗ trợ tại **Yêu cầu hỗ trợ**.

### Các tiện ích chung

- Kính lúp ở thanh trên hoặc **Ctrl+K / Command+K** mở tìm kiếm nhanh.
- Chuông thông báo hiển thị gói sắp hết hạn trong demo.
- Các nút **Xuất CSV** tải dữ liệu đã lọc về máy.
- Mở chi tiết hóa đơn → **In / Lưu PDF** → chọn máy in hoặc Save as PDF trong hộp thoại trình duyệt. Phiếu thu là tài liệu nội bộ.
- Trên điện thoại, bấm nút menu ở góc trái để mở điều hướng.

## 5. Một kịch bản demo đầy đủ để bàn giao

1. Đăng nhập vai trò **Quản lý trung tâm**.
2. **Thành viên → Thêm thành viên**; nhập thông tin minh họa và ghi lại ID mới.
3. **Gói thành viên → chọn người vừa tạo → chọn gói → xác nhận đăng ký**; ghi lại mã đăng ký gói.
4. **Thanh toán → Tạo hóa đơn**; chọn người đó, nhập ID đăng ký gói nếu có, số tiền và phương thức.
5. Hóa đơn mới có trạng thái **Chờ thanh toán**. Chọn **Thu tiền → Xác nhận** để ghi nhận PAID trong demo.
6. **Lớp học → Tạo lớp học**; chọn thời gian tương lai không trùng phòng/HLV, rồi tạo lớp.
7. Mở lớp → **Đăng ký cho thành viên**; chọn người vừa tạo. Chỗ trống giảm và thành viên xuất hiện trong roster.
8. **Điểm danh** → chọn lớp → ghi Có mặt/Vắng; xem lịch sử bên dưới.
9. **Báo cáo** → chọn khoảng ngày chứa giao dịch vừa tạo → Áp dụng để xem doanh thu.
10. Đổi sang các vai trò khác ở ảnh đại diện để xem khác biệt về menu và quyền.

Trong demo, đây chỉ là thao tác với dữ liệu minh họa, không chuyển tiền thực tế. Ở API mode, chỉ xác nhận thu/hoàn tiền sau khi đã kiểm tra giao dịch thật theo quy trình trung tâm.

## 6. Dữ liệu demo được lưu ở đâu?

Dữ liệu demo được lưu trong **localStorage của trình duyệt**, phiên đăng nhập nằm trong **sessionStorage**. Dữ liệu đó không nằm trong ZIP và không được chuyển sang máy người nhận.

Mỗi origin/port là một vùng dữ liệu riêng: `127.0.0.1:5173`, `127.0.0.1:4173` và `localhost:5173` có thể có dữ liệu/phiên khác nhau. Nên dùng nhất quán URL đang chạy.

- F5/tải lại trang giữ dữ liệu demo trên cùng origin.
- Đăng xuất xóa phiên, giữ dữ liệu demo.
- **Cài đặt → Dữ liệu demo → Khôi phục demo** tạo lại bộ dữ liệu mẫu và xóa thay đổi demo trên origin đó.
- Dùng thông tin minh họa khi demo; không dùng demo để lưu dữ liệu thật cần bàn giao lâu dài.
- Tài khoản tạo trong demo dùng mật khẩu chung `Sportiva@123`; mật khẩu nhập khi đăng ký không được lưu.

## 7. Chuyển frontend sang backend thật

Chỉ thực hiện khi đã có BE/DB chạy được và tài khoản hợp lệ. Nếu chỉ xem giao diện, giữ demo và bỏ qua phần này.

### 7.1. Tạo file cấu hình frontend

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Sửa `.env` bằng trình soạn thảo:

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=
API_PROXY_TARGET=http://localhost:8080
```

Giữ `VITE_API_BASE_URL` trống để FE gọi cùng origin qua proxy. Nếu BE ở máy khác, thay `API_PROXY_TARGET` bằng địa chỉ mà **máy chạy Vite** truy cập được. Không thêm `/api/v1` vào origin cấu hình.

Dừng frontend bằng Ctrl+C, chạy lại `npm run dev`, rồi đăng nhập bằng email/mật khẩu từ backend thật. Tài khoản demo chỉ dùng được trong demo.

Proxy trên phục vụ **dev server**. Khi triển khai production cần reverse proxy `/api` như hướng dẫn `docs/DEPLOYMENT.md`; không coi `npm run preview` là cấu hình triển khai BE hoàn chỉnh. Các biến `VITE_*` được cố định lúc build.

### 7.2. Điều kiện và khởi động backend

Backend nằm trong `backend/`; yêu cầu **JDK 23**, SQL Server, database `SportsCenterDB`, roles/catalog và tài khoản đã seed đúng.

**Điểm cần phối hợp với người phụ trách BE:** SQL script hiện có trong repo không khớp đầy đủ JPA entity. `ddl-auto=validate` không tự tạo bảng và repo chưa có Flyway để chạy migration tự động. Vì vậy không thể bảo đảm chạy BE ngay trên database trống chỉ bằng giải nén ZIP. Cần nhóm BE cung cấp migration hoặc DB đúng schema trước; chi tiết nằm trong `docs/AUDIT.md`.

Sau khi DB đúng schema và kết nối được, mở **terminal thứ hai**:

macOS/Linux:

```bash
cd backend
chmod +x mvnw
export DB_USERNAME='sa'
export DB_PASSWORD='THAY_BANG_MAT_KHAU_SQL_SERVER'
export JWT_SECRET="$(openssl rand -base64 32)"
./mvnw spring-boot:run
```

Windows PowerShell:

```powershell
cd backend
$env:DB_USERNAME = "sa"
$env:DB_PASSWORD = "THAY_BANG_MAT_KHAU_SQL_SERVER"
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($bytes)
.\mvnw.cmd spring-boot:run
```

Mặc định BE dùng SQL Server tại `localhost:1433`, database `SportsCenterDB`, HTTP port `8080`. Nếu môi trường khác, cấu hình thêm `DB_URL`/`SERVER_PORT` theo `backend/README.md` và cập nhật `API_PROXY_TARGET`. Maven wrapper cần Internet trong lần tải dependency đầu tiên. JWT secret ở ví dụ được tạo cho local; môi trường thật cần secret được quản lý ổn định theo cấu hình triển khai.

Các bước này là hướng dẫn chạy theo cấu hình source, **chưa được xác minh với BE/database thật** trong phiên bàn giao.

## 8. Những chức năng đang là demo/chờ backend

BE đã có API cho tài khoản, lớp/booking, gói đăng ký của thành viên, điểm danh, hóa đơn và doanh thu. FE gọi theo **DTO/controller thực tế nhánh BE**, do Swagger hiện lệch một số trường.

Danh mục gói/phòng/bộ môn, sửa hồ sơ, tạo nhân viên/phân quyền, kế hoạch/kết quả, yêu cầu hỗ trợ, thông báo, audit log và AI còn thiếu một phần hoặc toàn bộ endpoint. Các màn tương ứng hiển thị giới hạn rõ ràng khi chạy API mode. Trợ lý hiện là demo theo quy tắc, chưa gọi mô hình AI.

Các vấn đề schema, quyền truy cập tài nguyên và quy tắc nghiệp vụ cần sửa ở BE trước production đã ghi tại `docs/AUDIT.md`. Không coi frontend build thành công hoặc demo chạy được là bằng chứng toàn hệ thống đã production ready.

## 9. Kiểm tra source và tạo lại build

Chạy tại **thư mục gốc** có `package.json`:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

Bản đã bàn giao được kiểm thử với **79 test / 7 file pass**; xem `docs/QA.md`. `dist/` được tạo lại sau lệnh build. Nếu muốn build API mode, chỉnh `.env` trước khi build, rồi triển khai cùng reverse proxy theo `docs/DEPLOYMENT.md`.

## 10. Lỗi thường gặp

| Hiện tượng                                             | Cách xử lý                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Không tìm thấy `node`/`npm`                            | Cài Node.js có npm rồi mở lại terminal; kiểm tra `node -v`, `npm -v`.                            |
| `npm.ps1 cannot be loaded` trên Windows                | Dùng `npm.cmd ci` và `npm.cmd run dev`.                                                          |
| `ENOENT ... package.json`                              | Terminal đang sai thư mục. Đi vào thư mục gốc vừa giải nén, không vào `backend/`.                |
| `npm ci` không tải được                                | Kiểm tra Internet/proxy của máy; giữ `package-lock.json`, không chép `node_modules` từ máy khác. |
| Cổng 5173/4173 đã bận                                  | Mở URL mới Vite in ra hoặc dùng `npm run dev -- --port 5174`.                                    |
| Trang không mở sau khi đóng terminal                   | Chạy lại server; file ZIP không tự duy trì tiến trình trên máy khác.                             |
| Nhấp đúp `dist/index.html` bị trắng                    | Dùng `npm run preview`, mở URL HTTP Vite in ra.                                                  |
| Demo báo sai mật khẩu                                  | Dùng nút chọn vai trò hoặc tài khoản/mật khẩu trong mục 3; bảo đảm đang ở demo mode.             |
| Sửa `.env` chưa thấy tác dụng                          | Dừng/chạy lại Vite. Với bản build phải chạy lại `npm run build`.                                 |
| Mất phiên/dữ liệu khi đổi port/trình duyệt             | Demo lưu theo origin/trình duyệt; dùng lại đúng URL cũ.                                          |
| `Không kết nối được backend` hoặc proxy `ECONNREFUSED` | Kiểm tra BE đang chạy, port, `API_PROXY_TARGET` và kết nối từ máy chạy Vite.                     |
| Backend báo schema validation/missing table/column     | Cần DB/migration khớp entity do nhóm BE cung cấp; xem audit.                                     |
| API trả 401/403                                        | Đăng nhập lại bằng tài khoản thật, kiểm tra role/quyền BE; không dùng account demo cho API mode. |
| API trả HTML thay vì JSON                              | Kiểm tra origin API và reverse proxy, tránh để `/api` rơi vào fallback SPA.                      |
| Không thấy nút ở vai trò hiện tại                      | Mỗi vai trò có quyền riêng; đổi vai trò demo ở ảnh đại diện để so sánh.                          |

## 11. Tài liệu cho người tiếp nhận phát triển

- `README.md`: tổng quan và các lệnh dự án.
- `docs/AUDIT.md`: đối chiếu yêu cầu/Swagger/BE, các blocker và phần cần nhóm BE xử lý.
- `docs/API-CONTRACT.md`: endpoint và DTO mà FE đang dùng.
- `docs/QA.md`: test đã chạy, browser QA, ảnh và giới hạn xác minh.
- `docs/DEPLOYMENT.md`: build API mode, Docker/Nginx, cấu hình triển khai.
- `backend/README.md`: yêu cầu chạy source BE gốc.

Nếu cần đọc lịch sử Git, có thể clone bundle vào **một thư mục khác**:

```bash
git clone git-history/upstream.bundle ../SportsCenter-upstream-history
```

Thư mục lịch sử đó không chứa các thay đổi FE mới chưa commit; source mới đầy đủ nằm ở thư mục đã giải nén. Người nhận có thể quản lý source bàn giao bằng repo/nhánh của mình theo quy trình nhóm. Bản bàn giao này không push GitHub và không chứa thông tin đăng nhập DB thật.
