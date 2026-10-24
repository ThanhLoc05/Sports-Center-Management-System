# Báo cáo kiểm thử tổng quan và bộ ca để tự kiểm tra

Ngày lập: 22/10/2026. Báo cáo tổng hợp kết quả đã có; lượt lập báo cáo này không thay đổi code ứng dụng và không tự chạy thêm các ca manual bên dưới.

## 1. Phân biệt hai môi trường

| Môi trường  | Địa chỉ                                                                | Tài khoản/dữ liệu                                        | Dùng để kiểm tra                                               |
| ----------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| Demo online | https://sportiva-demo.vercel.app                                       | Chọn 4 vai trò ở Khám phá bản demo; dữ liệu localStorage | Giao diện, luồng mô phỏng, xử lý form và thao tác theo vai trò |
| API local   | http://127.0.0.1:5173 → backend http://127.0.0.1:8080 → SportsCenterDB | Các tài khoản API đã tạo, quản lý duyban246@gmail.com    | Request thật, quyền backend, dữ liệu lưu SQL                   |

Demo online không kết nối SQL local. `duyban246@gmail.com` là tài khoản API local, không phải tài khoản demo online. Bấm vai trò Thành viên ở demo sẽ vào người mẫu có sẵn, không phải thành viên TEST mới tạo.

## 2. Đã test gì và kết luận đến đâu?

| Nhóm                       | Kết quả đã ghi nhận                                                                               | Phạm vi kết luận                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Kiểm thử frontend tự động  | 83/83 test đạt ở 8 file                                                                           | Component/helper/route/logic demo và hợp đồng gọi API qua mock; không phải 83 ca bấm tay trên website |
| Tích hợp API local         | 28/28 request có mã HTTP đúng kỳ vọng                                                             | Backend thật nhận/trả các yêu cầu trong luồng đã chạy; không phải 28 flow độc lập                     |
| Dữ liệu SQL                | Đã đọc và đối chiếu trực tiếp                                                                     | User, class, booking, subscription, attendance, invoice thật đã lưu trong database local mới          |
| Browser API local          | Đăng nhập quản lý, xem dashboard, tạo lớp bằng form                                               | Lớp `Fitness - tạo từ giao diện thật` được xác nhận là class_id=2 trong SQL                           |
| Browser demo Vercel        | Mở công khai, vào vai trò quản lý, xem dashboard/lớp, reload /classes                             | Bản build demo hoạt động và route con không bị 404; chưa bấm tay hết 4 vai trò/mọi thiết bị           |
| Build và giới hạn sửa code | Build thành công; 30 file chú thích giữ nguyên JavaScript thực thi/CSS; 82 file backend không đổi | Comment không thay hành vi; không chứng minh hệ thống hoàn thiện toàn bộ topic                        |

### 2.1. Phân bố 83 test tự động

| File             | Số test | Đã kiểm tra                                                                                                                                       |
| ---------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| api-mode.test.ts |       4 | Mặc định API, login gọi backend, loại phiên demo cũ khi API mode, fetch lỗi không fallback demo                                                   |
| api.test.ts      |      15 | Method/URL/payload/JWT, lỗi 401/validation/network, dữ liệu danh sách sai, HTML từ proxy, response rỗng; dùng fetch mock                          |
| auth.test.tsx    |      10 | Chặn chưa đăng nhập/sai vai trò, cho quản lý vào, phiên hỏng, logout/cache, sự kiện hết phiên, không giữ mật khẩu trong session demo              |
| demo.test.ts     |      18 | Đăng ký trùng, booking trùng/hủy/đặt lại, sở hữu, lịch phòng/HLV, sức chứa, gói/gia hạn, điểm danh trùng, hóa đơn/doanh thu, lưu và phục hồi demo |
| pages.test.tsx   |      17 | Render 17 route với tài khoản quản lý và dữ liệu demo; không phải test toàn bộ thao tác của 17 trang                                              |
| ui.test.tsx      |       4 | Tìm tiếng Việt không dấu, phân trang sau lọc, form lỗi giữ mở, dialog có label và Escape                                                          |
| export.test.ts   |       9 | CSV BOM tiếng Việt, dấu nháy/null và 7 kiểu tiền tố công thức                                                                                     |
| time.test.ts     |       6 | UTC+7, LocalDate/LocalDateTime, chuyển ngày, dữ liệu datetime-local và cộng ngày qua tháng                                                        |
| **Tổng**         |  **83** | **Kết quả đã ghi nhận: 83 đạt**                                                                                                                   |

17 route render đã kiểm tra: /, /members, /team, /facilities, /classes, /schedule, /bookings, /memberships, /attendance, /payments, /reports, /training, /assistant, /support, /audit, /settings, /profile.

### 2.2. Luồng API thật đã chạy

```text
Đăng ký 4 tài khoản qua frontend → gán vai trò ban đầu trong SQL local
→ đăng nhập 4 vai trò → đọc hồ sơ
→ quản lý đọc danh sách người dùng
→ kiểm tra MEMBER bị cấm đọc danh sách và login sai mật khẩu
→ quản lý tạo lớp → thành viên xem lớp/sức chứa
→ đặt lớp → đọc booking và sức chứa → thử đặt trùng
→ đăng ký gói → đọc lịch sử gói
→ lễ tân điểm danh → HLV đọc điểm danh
→ lễ tân tạo hóa đơn PENDING → xác nhận PAID
→ thành viên đọc hóa đơn → quản lý đọc doanh thu
→ thành viên hủy booking → đặt lại
```

Đăng ký/bootstrap tài khoản và phép thử kết nối là bước chuẩn bị riêng, không cộng vào danh sách 28 request của lượt workflow. Các HTTP 400/401/403 được mong đợi ở ca âm không phải là lỗi test.

| Tình huống trong lượt workflow          | HTTP/kết quả đã thấy                             |
| --------------------------------------- | ------------------------------------------------ |
| Login 4 vai trò và đọc hồ sơ chính mình | 200                                              |
| Quản lý GET /users; MEMBER GET /users   | 200; 403 đúng dự kiến                            |
| Login sai mật khẩu                      | 401 đúng dự kiến                                 |
| Tạo lớp, đặt lớp                        | 201                                              |
| Đọc chỗ trước/sau đặt                   | 200; số chỗ giảm 1                               |
| Đặt lại khi đang BOOKED                 | 400 đúng dự kiến                                 |
| Đăng ký gói và đọc lại                  | 201; 200, ACTIVE                                 |
| Ghi điểm danh và HLV đọc lại            | 201; 200, PRESENT                                |
| Tạo hóa đơn và xác nhận thu             | 201 PENDING; 200 PAID                            |
| Đọc hóa đơn và doanh thu                | 200; tổng 800000 trong database thử lúc kiểm tra |
| Hủy rồi đặt lại booking                 | 200 CANCELLED; 201 BOOKED                        |

Bản ghi kiểm thử local được đối chiếu: class_id=1, member_id=4, booking_id=1, subscription_id=1, attendance_id=1, invoice_id=1. Hóa đơn 800000 BANK_TRANSFER trạng thái PAID. Lớp tạo thêm bằng thao tác trên browser là class_id=2. Các ID này thuộc database local, không dùng để đối chiếu bộ dữ liệu demo Vercel.

Bằng chứng gốc: `.local/live-test-results.json`, `.local/live-test-records.json`, `.local/tomcat/logs/access_log.2026-10-22.log` và `docs/API-LIVE-TEST.md` trong dự án.

### 2.3. Chưa được chứng minh / còn giới hạn

- Chưa kiểm tra tải lớn, hai request đặt chỗ đồng thời, nhiều người dùng, nhiều thiết bị hoặc mọi trình duyệt.
- Mất mạng/hết phiên có test tự động mô phỏng; chưa phải tất cả đều được thử tay với backend bị tắt hoặc JWT thật tự hết hạn.
- Các ca hoàn tiền, trùng lịch phòng/HLV, giảm sức chứa, gia hạn thay thế đã có kiểm tra demo; không được lấy đó làm bằng chứng backend thật có tất cả cùng hành vi.
- Danh mục phòng/bộ môn/gói, kế hoạch, hỗ trợ, audit và trợ lý AI còn các phần demo/chưa có API. Chưa có AI thật, cổng thanh toán thật, hệ thống thông báo realtime hoàn chỉnh hay chức năng phân quyền tùy ý đầy đủ theo topic.
- UI và route guard không thay kiểm tra quyền server. Các ca API sở hữu/cạnh tranh phía dưới là kiểm tra bổ sung, chưa nằm trong 28 request đã chạy.
- Lỗi 403 của kết nối quản trị Vercel MCP là vấn đề quyền công cụ hosting riêng; không phải kết quả thất bại của ca đăng ký lớp trong ứng dụng.

## 3. Cách tự kiểm tra demo

Mở https://sportiva-demo.vercel.app. Đăng nhập qua nút vai trò hoặc dùng:

| Vai trò    | Email demo              | Mật khẩu     |
| ---------- | ----------------------- | ------------ |
| Quản lý    | manager@sportiva.demo   | Sportiva@123 |
| HLV        | coach1@sportiva.demo    | Sportiva@123 |
| Thành viên | member1@sportiva.demo   | Sportiva@123 |
| Lễ tân     | reception@sportiva.demo | Sportiva@123 |

Thực hiện chuỗi dữ liệu chung trong **cùng một trình duyệt/profile và đúng domain**; đổi vai trò trên cùng tab. Trình duyệt ẩn danh hoặc trình duyệt khác không chia sẻ dữ liệu demo. Đăng xuất không xóa dữ liệu demo. Chỉ khôi phục demo sau khi đã lưu kết quả/chụp ảnh; khôi phục sẽ làm mất dữ liệu TEST trong trình duyệt đó.

Mật khẩu demo là mật khẩu chung; việc form đăng ký nhận mật khẩu không chứng minh demo đã lưu và xác thực mật khẩu riêng. Trong các ca dưới đây dùng Sportiva@123 để không nhầm với luồng mật khẩu thật của API local.

### Dữ liệu chung cần ghi lại

| Dữ liệu                        | Giá trị/ô ghi                                                  |
| ------------------------------ | -------------------------------------------------------------- |
| Thành viên mới                 | TEST Thành viên 01                                             |
| Email                          | test.thanhvien01@example.test                                  |
| Điện thoại                     | 0919991101; nếu đã dùng, đổi cả chuỗi ca sang một số/email mới |
| ID thành viên                  | …                                                              |
| Lớp chính                      | TEST_E2E, Yoga, Studio Zen, Trần Thanh Hương, 2 chỗ            |
| Ngày lớp                       | Sau hôm nay 10 ngày, ban đầu 10:00; sau C02 là 11:00           |
| Lớp kiểm tra đầy               | TEST_FULL, 1 chỗ, ngày khác lớp chính                          |
| Hóa đơn thử                    | 123000 VND, CASH; ID: …                                        |
| Doanh thu gốc cùng khoảng ngày | R0 = …                                                         |

### Chạy nhanh để kiểm tra xuyên suốt ba flow bắt buộc

1. A02 → B01 → B07: quản lý tạo thành viên, lễ tân đăng ký gói. Kiểm tra chưa có thu tiền tự động.
2. C01 → C02 → C07 → C08 → C09: tạo/phân công lớp, đổi giờ, thành viên test đăng ký, thử trùng, hủy rồi đặt lại; xem số chỗ và lịch cá nhân.
3. D01 → D03 → D04 → D05 → D06: ghi R0, lập PENDING, thu thành PAID, chống thu lại, quyền hoàn tiền, REFUNDED và tổng về R0.
4. A05 → A07 → F01: kiểm tra quyền trang, đăng xuất và reload route.
5. Sau đó mới chạy các ca âm/phụ còn lại. C12/B10/F04 chạy cuối nhóm vì thay đổi hoặc xóa trạng thái mà ca trước cần dùng.

Bộ tự kiểm tra có **56 ca: 48 ca demo online và 8 ca API local**. Không nhất thiết chạy theo thứ tự mã; đọc điều kiện chuẩn bị và dùng chuỗi chạy nhanh ở trên trước.

P0 = nên test trước khi demo/bảo vệ; P1 = kiểm tra bổ sung. **Toàn bộ ô kết quả trong bộ ca bên dưới đang để Chưa chạy tay.** Các test tự động/API đã có ở phần 2 không tự động biến bộ ca manual này thành PASS.

Quy tắc đánh dấu: PASS khi đủ điều kiện, làm đúng bước và kết quả khớp; FAIL khi khác mong đợi; BLOCKED khi thiếu điều kiện/chưa có endpoint. Nếu UI chặn nút, ghi “UI chặn”, không tự ghi đã xác nhận server từ chối request.

## 4. Bộ ca tự test

### 4.1. Đăng nhập và phân quyền

#### A01 — Vào đúng không gian theo vai trò

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Cả 4 vai trò.
- **Chuẩn bị:** Đang ở trang đăng nhập demo.
- **Thao tác:** Lần lượt chọn Quản lý, HLV, Thành viên và Lễ tân trong Khám phá bản demo; mỗi lượt đăng xuất hoặc đổi vai trò qua menu tài khoản.
- **Mong đợi:** Vào được hệ thống; menu/nút thay đổi theo vai trò, không trắng trang. Thành viên không có nút tạo lớp, HLV không có trang báo cáo quản lý.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A02 — Đăng nhập bằng tài khoản demo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** Đăng xuất để trở về /login.
- **Thao tác:** Nhập manager@sportiva.demo, mật khẩu Sportiva@123 rồi Đăng nhập.
- **Mong đợi:** Vào dashboard của quản lý và thấy nhãn chế độ demo. Đây không phải kiểm tra JWT/backend thật.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A03 — Mật khẩu sai

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Bất kỳ.
- **Chuẩn bị:** Đang ở /login.
- **Thao tác:** Dùng manager@sportiva.demo nhưng nhập SaiMatKhau123.
- **Mong đợi:** Hiện lỗi, giữ trang đăng nhập; không tạo phiên và không vào dashboard.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A04 — Không vào được route cần đăng nhập

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Chưa đăng nhập.
- **Chuẩn bị:** Đăng xuất.
- **Thao tác:** Gõ trực tiếp https://sportiva-demo.vercel.app/payments vào thanh địa chỉ.
- **Mong đợi:** Chuyển về /login; không hiện dữ liệu hóa đơn.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A05 — Chặn URL quản lý khi nhập trực tiếp

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Thành viên.
- **Chuẩn bị:** Vào vai trò Thành viên.
- **Thao tác:** Lần lượt gõ /reports, /team và /audit trên cùng domain.
- **Mong đợi:** Hiện không đủ quyền; không chỉ đơn thuần ẩn menu. Đây là guard frontend, chưa chứng minh bảo mật API.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A06 — Lịch dạy chỉ gồm lớp phụ trách

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / HLV.
- **Chuẩn bị:** Quản lý đã tạo TEST_E2E phân công cho Trần Thanh Hương theo C01.
- **Thao tác:** Đăng nhập coach1@sportiva.demo bằng Sportiva@123; mở Lớp học và Lịch hoạt động.
- **Mong đợi:** Thấy TEST_E2E do mình phụ trách; đối chiếu HLV trên lớp. Không tự nhận có thể quản lý/sửa lớp của HLV khác.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### A07 — Đăng xuất kết thúc phiên

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Bất kỳ.
- **Chuẩn bị:** Đã vào dashboard.
- **Thao tác:** Đăng xuất; thử mở lại /classes rồi bấm Back của trình duyệt.
- **Mong đợi:** Không quay lại được màn nghiệp vụ cần đăng nhập với phiên cũ; guard đưa về login.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.2. Flow 1 — Người dùng và gói

#### B01 — Tạo thành viên tại quầy

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** Email test.thanhvien01@example.test và số 0919991101 chưa tồn tại.
- **Thao tác:** Thành viên → Thêm thành viên. Nhập TEST Thành viên 01, email trên, số trên, mật khẩu Sportiva@123; lưu.
- **Mong đợi:** Có một tài khoản MEMBER mới, tìm lại được trong danh sách; không tự tạo quản lý/HLV. Ghi ID thành viên vào phiếu dữ liệu test.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B02 — Form thông tin không hợp lệ

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Mở form Thêm thành viên.
- **Thao tác:** Thử để trống họ tên/email/số điện thoại; thử email abc và số điện thoại quá ngắn; lưu từng lượt.
- **Mong đợi:** Trình duyệt/form ngăn lưu dữ liệu không hợp lệ; không xuất hiện thành viên mới. Không bắt buộc mọi lỗi phải hiện bằng toast.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B03 — Chặn email trùng

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** B01 đã thành công.
- **Thao tác:** Tạo người khác cùng email test.thanhvien01@example.test nhưng số điện thoại mới.
- **Mong đợi:** Báo email đã dùng, giữ form để sửa; không có bản ghi thứ hai cùng email.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B04 — Chặn số điện thoại trùng

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** B01 đã thành công.
- **Thao tác:** Tạo người khác với email mới test.trungphone@example.test và số 0919991101.
- **Mong đợi:** Báo số điện thoại đã dùng; không tạo thêm thành viên.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B05 — Tìm kiếm và lọc danh sách

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Danh sách có Nguyễn Minh Anh và TEST Thành viên 01.
- **Thao tác:** Tìm nguyen minh anh không dấu; tìm email test.thanhvien01@example.test; thử từ khóa không tồn tại và lọc trạng thái.
- **Mong đợi:** Tìm không dấu vẫn khớp tên có dấu; danh sách đúng bộ lọc; từ khóa lạ hiện trạng thái trống, không lỗi trang.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B06 — Vô hiệu hóa tài khoản

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý rồi thành viên test.
- **Chuẩn bị:** B01 đã có tài khoản test; chưa dùng tài khoản đó cho các ca phụ thuộc khác hoặc sẽ bật lại ngay.
- **Thao tác:** Quản lý chuyển tài khoản test sang ngừng hoạt động; đăng xuất, thử login email test với Sportiva@123. Sau đó quản lý bật ACTIVE lại.
- **Mong đợi:** Tài khoản INACTIVE không đăng nhập mới được; bật lại mới đăng nhập được. Ca này không khẳng định phiên đang mở bị server thu hồi ngay.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B07 — Đăng ký gói cho thành viên mới

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Lễ tân.
- **Chuẩn bị:** TEST Thành viên 01 đang ACTIVE, chưa có gói đang hoạt động.
- **Thao tác:** Gói thành viên → chọn TEST Thành viên 01 → Đăng ký → chọn một gói đang có → xác nhận.
- **Mong đợi:** Lịch sử có gói ACTIVE, ngày bắt đầu/kết thúc hợp lý; chưa tự phát sinh hóa đơn hoặc thu tiền.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B08 — Không đăng ký chồng gói đang hoạt động

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Thành viên test hoặc lễ tân.
- **Chuẩn bị:** B07 đã thành công.
- **Thao tác:** Nếu giao diện còn thao tác đăng ký mới, thử thêm gói ACTIVE thứ hai; nếu chỉ còn Gia hạn, ghi nhận UI hướng sang gia hạn.
- **Mong đợi:** Không tạo thêm gói mới theo nhánh subscribe chồng gói ACTIVE. UI dẫn tới gia hạn không phải một lần kiểm thử endpoint subscribe; logic từ chối được kiểm tra riêng bằng test tự động.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B09 — Gia hạn theo hành vi hiện tại

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Lễ tân.
- **Chuẩn bị:** Đã có gói từ B07, ghi lại ID, startDate và endDate trước gia hạn.
- **Thao tác:** Bấm Gia hạn, đọc thông báo trên form, chọn gói và xác nhận.
- **Mong đợi:** Gói cũ sang EXPIRED, gói mới ACTIVE và tính kỳ mới từ hôm nay theo code hiện tại; không giả định cộng thêm ngày còn lại. Không tự thu tiền.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### B10 — Hủy gói không tự hoàn tiền

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân/quản lý.
- **Chuẩn bị:** Có một gói ACTIVE của thành viên test; nếu đã có hóa đơn, ghi lại trạng thái hóa đơn.
- **Thao tác:** Hủy gói qua hộp thoại xác nhận; xem lại lịch sử gói và hóa đơn.
- **Mong đợi:** Gói sang CANCELLED; hóa đơn đã thanh toán không tự thành REFUNDED. Chạy sau ca gia hạn và sau các ca cần gói còn hiệu lực.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.3. Flow 2 — Lớp, booking và lịch

#### C01 — Tạo lớp và phân công HLV

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** Chọn ngày sau hôm nay 10 ngày để tránh các lịch mẫu có sẵn.
- **Thao tác:** Tạo TEST_E2E: Yoga, Studio Zen (20 chỗ), HLV Trần Thanh Hương, bắt đầu 10:00 ngày đã chọn, thời lượng 60 phút, sức chứa 2; lưu.
- **Mong đợi:** Có lớp mới đúng tên/HLV/phòng/ngày giờ; mở Lịch hoạt động ở tuần đó thấy lớp. Ghi ID nếu màn chi tiết hiển thị.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C02 — Sửa lịch đồng bộ các màn

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** TEST_E2E chưa có booking, ca C01 đã xong.
- **Thao tác:** Đổi giờ từ 10:00 sang 11:00 cùng ngày; lưu rồi xem cả danh sách và lịch tuần.
- **Mong đợi:** Cùng lớp xuất hiện ở giờ mới, không tự nhân đôi lớp. Các ca trùng lịch phía sau dùng giờ mới 11:00.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C03 — Sức chứa vượt phòng

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Studio Zen có sức chứa 20.
- **Thao tác:** Tạo TEST_VUOT_PHONG tại ngày/giờ chưa trùng, chọn Studio Zen nhưng sức chứa 21.
- **Mong đợi:** Demo báo sức chứa lớp vượt phòng, giữ form; không tạo lớp.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C04 — Ngày giờ và dữ liệu cơ bản sai

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Mở form tạo lớp.
- **Thao tác:** Thử giờ trong quá khứ; thử thời lượng 0, sức chứa 0 và tên để trống ở các lượt riêng.
- **Mong đợi:** Form hoặc xử lý demo từ chối; không có lớp sai dữ liệu. Nhận biết chặn HTML trước submit khác với lỗi do service trả về.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C05 — Trùng phòng, khác HLV

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** TEST_E2E tại Studio Zen, 11:00–12:00, ngày theo C01/C02.
- **Thao tác:** Tạo lớp khác cùng phòng/ngày/giờ trên nhưng chọn HLV khác.
- **Mong đợi:** Demo từ chối vì phòng trùng lịch; không thêm lớp thứ hai.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C06 — Trùng HLV, khác phòng

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** TEST_E2E do Trần Thanh Hương dạy 11:00–12:00.
- **Thao tác:** Tạo lớp khác cùng ngày/giờ, vẫn Trần Thanh Hương nhưng phòng khác.
- **Mong đợi:** Demo từ chối vì HLV trùng lịch. Đây là kiểm tra demo, chưa chứng minh backend có cùng kiểm soát.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C07 — Đặt lớp cập nhật chỗ và lịch cá nhân

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Thành viên test.
- **Chuẩn bị:** TEST_E2E chưa bắt đầu/còn chỗ; TEST Thành viên 01 đã được bật ACTIVE. Đăng nhập email tạo ở B01, không dùng nút Thành viên vì nút đó vào người mẫu khác.
- **Thao tác:** Mở TEST_E2E → Đăng ký; xem Đăng ký lớp của tôi và Lịch tập của tôi ở tuần tương ứng.
- **Mong đợi:** Có BOOKED cho đúng người; chỗ trống giảm từ 2 xuống 1; lịch cá nhân xuất hiện TEST_E2E.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C08 — Đặt trùng cùng lớp

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Thành viên test.
- **Chuẩn bị:** C07 đã thành công.
- **Thao tác:** Thử đăng ký lại TEST_E2E nếu nút vẫn cho thao tác; đối chiếu danh sách booking.
- **Mong đợi:** Không có booking BOOKED thứ hai cho cùng thành viên/lớp; báo đã đăng ký hoặc UI không cho đặt lại. Nếu nút bị chặn, chỉ kết luận UI chặn, không coi là đã gửi request trùng.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C09 — Hủy rồi đăng ký lại

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Thành viên test.
- **Chuẩn bị:** Có booking từ C07.
- **Thao tác:** Hủy booking trong Đăng ký lớp của tôi; xem lại lịch và số chỗ; sau đó đặt lại TEST_E2E.
- **Mong đợi:** Hủy: CANCELLED, trả chỗ, lịch cá nhân không còn booking đang hoạt động của lớp đó. Đặt lại: BOOKED, giảm chỗ trở lại.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C10 — Không vượt sức chứa khi lần lượt đặt

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý và hai thành viên.
- **Chuẩn bị:** Tạo riêng TEST_FULL, sức chứa 1, ngày khác TEST_E2E để không trùng lịch.
- **Thao tác:** TEST Thành viên 01 đặt chỗ duy nhất; đăng xuất, vào member1@sportiva.demo rồi thử đặt TEST_FULL.
- **Mong đợi:** Người thứ hai không đặt được; tổng BOOKED vẫn 1. Đây là hai lượt tuần tự, chưa kiểm tra cạnh tranh đồng thời.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C11 — Không giảm sức chứa dưới số đã đặt

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** TEST_E2E đang có 2 booking BOOKED: thêm member1 vào lớp này nếu mới có một.
- **Thao tác:** Chỉnh sửa TEST_E2E, giảm sức chứa từ 2 xuống 1 rồi lưu.
- **Mong đợi:** Báo sức chứa nhỏ hơn số đã đăng ký; giá trị đã lưu vẫn 2, không làm mất booking.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### C12 — Hủy cả lớp

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý rồi các thành viên.
- **Chuẩn bị:** TEST_E2E còn BOOKED; chạy sau các ca cần lớp mở.
- **Thao tác:** Quản lý hủy lớp, xác nhận; xem lọc Đã hủy, danh sách booking và lịch cá nhân của những người đã đăng ký.
- **Mong đợi:** Lớp CANCELLED; các booking lớp đó CANCELLED; không còn lớp đang hoạt động trong lịch cá nhân. Không nhầm với chỉ hủy một booking.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.4. Flow 3 — Hóa đơn và báo cáo

#### D01 — Lập hóa đơn chưa tính là thu tiền

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý, sau đó lễ tân.
- **Chuẩn bị:** Quản lý xem báo cáo hôm nay, ghi tổng R0. Dùng đúng thành viên TEST; trong chuỗi D01–D06 không tạo thêm giao dịch khác.
- **Thao tác:** Lễ tân tạo hóa đơn amount 123000, CASH, có thể bỏ trống ID đăng ký gói; ghi ID hóa đơn. Quản lý xem lại cùng khoảng báo cáo.
- **Mong đợi:** Hóa đơn PENDING; tổng doanh thu vẫn R0. Đúng người, tiền, phương thức và ngày.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D02 — Không tạo hóa đơn số tiền sai

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân.
- **Chuẩn bị:** Mở form hóa đơn mới.
- **Thao tác:** Thử bỏ trống số tiền, nhập 0 rồi số âm ở các lượt riêng.
- **Mong đợi:** Không lưu hóa đơn; form giữ lại cho sửa. Nếu trình duyệt chặn trước submit thì ghi rõ là kiểm tra HTML.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D03 — Thu tiền cập nhật doanh thu

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Lễ tân rồi quản lý.
- **Chuẩn bị:** Hóa đơn D01 còn PENDING.
- **Thao tác:** Lễ tân xác nhận đã thu tiền; quản lý mở lại báo cáo hôm nay.
- **Mong đợi:** Hóa đơn PAID; doanh thu cùng khoảng thành R0 + 123000. Không có giao dịch ngân hàng thật trong bản demo.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D04 — Không thu một hóa đơn hai lần

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân.
- **Chuẩn bị:** D03 đã PAID.
- **Thao tác:** Xem các thao tác của hóa đơn; nếu còn cách bấm Thu tiền thì thử lại.
- **Mong đợi:** Không thu lại: nút mất/bị chặn hoặc báo trạng thái không hợp lệ; không cộng doanh thu lần hai.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D05 — Không có quyền hoàn tiền

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Lễ tân và thành viên test.
- **Chuẩn bị:** Hóa đơn D01 đã PAID.
- **Thao tác:** Ở vai trò lễ tân rồi thành viên test, mở hóa đơn và xem thao tác được phép.
- **Mong đợi:** Không có thao tác Hoàn tiền dành cho hai vai trò này. Kiểm tra UI không thay kiểm tra quyền API; logic quyền demo đã có test tự động.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D06 — Hoàn tiền và loại khỏi doanh thu

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Quản lý.
- **Chuẩn bị:** Hóa đơn D01 đã PAID, tổng hiện R0 + 123000.
- **Thao tác:** Quản lý hoàn tiền và xác nhận; xem trạng thái và báo cáo cùng khoảng.
- **Mong đợi:** Hóa đơn REFUNDED; tổng về R0 nếu không có giao dịch khác. Chỉ ghi trạng thái, không tự chuyển tiền thật.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D07 — Chỉ xem hóa đơn của mình

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Thành viên test.
- **Chuẩn bị:** D01 có hóa đơn cho TEST Thành viên 01; có hóa đơn mẫu của người khác.
- **Thao tác:** Đăng nhập email TEST đã tạo; mở Hóa đơn của tôi và đối chiếu ID/thành viên.
- **Mong đợi:** Thấy hóa đơn của mình, không thấy toàn bộ hóa đơn người khác; không có form tạo hóa đơn dành cho thành viên.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D08 — Lọc khoảng thời gian báo cáo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Có ít nhất một hóa đơn PAID trong khoảng cần kiểm tra; có thể dùng một hóa đơn thử khác không hoàn tiền.
- **Thao tác:** Chọn khoảng chứa ngày hóa đơn, bấm áp dụng; đổi sang khoảng không chứa ngày đó.
- **Mong đợi:** Chỉ cộng PAID nằm trong khoảng đã áp dụng. Tổng thay đổi theo bộ lọc, PENDING/REFUNDED không được cộng.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### D09 — In và xuất dữ liệu hóa đơn

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân/quản lý.
- **Chuẩn bị:** Có hóa đơn thử.
- **Thao tác:** Mở Chi tiết → In, xem bản xem trước rồi chọn lưu PDF hoặc hủy; xuất CSV danh sách hiện tại và mở file.
- **Mong đợi:** Phiếu đúng người/số tiền/trạng thái, phần in đọc được; CSV giữ dấu tiếng Việt/cột dữ liệu. Không gọi đây là hóa đơn điện tử pháp lý hay xác nhận cổng thanh toán thật.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.5. Chức năng tùy chọn và công cụ hỗ trợ

#### E01 — Điểm danh có mặt một lần

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân hoặc HLV.
- **Chuẩn bị:** Chọn lớp có booking BOOKED, chưa có attendance của thành viên trong lớp; đặt bộ lọc lịch sử bao gồm hôm nay.
- **Thao tác:** Điểm danh PRESENT; tải lại danh sách và xem lịch sử phía thành viên đó.
- **Mong đợi:** Có một kết quả PRESENT đúng member/class; người ghi nhận đúng vai trò đang thao tác. Việc cho phép điểm danh trước/sau giờ lớp cần đối chiếu yêu cầu, không suy ra từ ca này.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### E02 — Không điểm danh trùng

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Lễ tân/HLV.
- **Chuẩn bị:** E01 đã có kết quả của người học trong lớp.
- **Thao tác:** Thử thêm cùng người/cùng lớp bằng form khác nếu UI còn cho; kiểm tra danh sách.
- **Mong đợi:** Không có attendance trùng; báo đã điểm danh hoặc UI loại khỏi danh sách cần điểm danh.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### E03 — Kế hoạch, kết quả và nhận xét demo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / HLV rồi thành viên.
- **Chuẩn bị:** HLV và thành viên thử đã có trong dữ liệu demo.
- **Thao tác:** HLV tạo TEST_KE_HOACH cho một thành viên, nhập mục tiêu/bài tập; ghi kết quả hoặc nhận xét theo các thao tác màn hình; đổi sang đúng thành viên để xem.
- **Mong đợi:** Dữ liệu mới xuất hiện đúng thành viên/kế hoạch; vẫn được đánh dấu demo local, không kết luận đã lưu vào backend.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### E04 — Trợ lý và gợi ý buổi tập demo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Thành viên.
- **Chuẩn bị:** Đang dùng bản Vercel demo.
- **Thao tác:** Hỏi lịch lớp, hỏi gói tập; mở Gợi ý buổi tập, chọn mục tiêu/mức độ/thời gian.
- **Mong đợi:** Nhận nội dung theo dữ liệu và quy tắc demo, không trắng trang; giao diện nêu rõ chưa kết nối AI. Không đánh giá đây là mô hình AI cá nhân hóa thật.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### E05 — Gửi và xử lý yêu cầu hỗ trợ demo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Thành viên rồi lễ tân.
- **Chuẩn bị:** Dùng cùng trình duyệt/domain để đổi vai trò.
- **Thao tác:** Thành viên tạo TEST_HO_TRO với mô tả hơn 10 ký tự; lễ tân mở yêu cầu, Đánh dấu đã xử lý; thành viên xem lại.
- **Mong đợi:** Phiếu mới OPEN, sau xử lý RESOLVED và đúng nội dung; vẫn là dữ liệu demo trình duyệt, không có email/ticket thật gửi tới bên ngoài.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### E06 — Nhật ký thao tác demo

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Vừa tạo/sửa lớp hoặc đổi trạng thái một tài khoản demo.
- **Thao tác:** Mở Nhật ký hoạt động, tìm theo tên hành động hoặc TEST.
- **Mong đợi:** Có người thao tác, hành động, chi tiết và thời gian tương ứng. Đây không phải audit log chống sửa được bảo vệ ở backend.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.6. Giao diện, dữ liệu và điều hướng

#### F01 — Reload và lưu dữ liệu local

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P0 / Bất kỳ.
- **Chuẩn bị:** Có dữ liệu TEST đã tạo; chưa khôi phục demo.
- **Thao tác:** Reload ngay tại /classes hoặc /members; đăng xuất rồi đăng nhập lại cùng trình duyệt.
- **Mong đợi:** Không 404 khi reload route; dữ liệu demo đã lưu vẫn còn. Phiên và dữ liệu là hai phạm vi khác nhau.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### F02 — Giao diện màn hình nhỏ

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Bất kỳ.
- **Chuẩn bị:** Mở công cụ responsive hoặc thu chiều rộng cửa sổ khoảng 390px.
- **Thao tác:** Thử sidebar, trang lớp, bảng thành viên và form có nhiều trường.
- **Mong đợi:** Menu đóng/mở được, các nút quan trọng còn tiếp cận được; bảng có thể cuộn, form không mất nút lưu/đóng. Đây là checklist mới, chưa được xác nhận đầy đủ cho mọi thiết bị.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### F03 — Form lỗi không đóng và dùng được bàn phím

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Mở form tạo lớp và tạo lỗi nghiệp vụ như trùng lịch.
- **Thao tác:** Lưu để nhận lỗi; kiểm tra dữ liệu nhập còn đó; sửa lỗi, hoặc bấm Escape để đóng khi không đang xử lý.
- **Mong đợi:** Lỗi không tự báo thành công/đóng form; Escape đóng được hộp thoại hợp lệ; Tab không đi lạc ra nền trong lúc modal mở.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### F04 — Khôi phục demo sau khi kết thúc test

- **Môi trường / ưu tiên / vai trò:** DEMO ONLINE / P1 / Quản lý.
- **Chuẩn bị:** Đã ghi kết quả/chụp ảnh các ca TEST cần giữ.
- **Thao tác:** Cài đặt → Dữ liệu demo → Khôi phục demo → xác nhận.
- **Mong đợi:** Các thay đổi TEST bị xóa khỏi bộ dữ liệu demo của trình duyệt và dữ liệu mẫu được tạo lại. Backend local không đổi. Chạy ca này CUỐI CÙNG.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

### 4.7. Kiểm tra bổ sung cần API local

#### G01 — Đăng nhập và dữ liệu thật

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P0 / Cả 4 vai trò.
- **Chuẩn bị:** Frontend/API/SQL local đang chạy; dùng tài khoản API local, không dùng email @sportiva.demo.
- **Thao tác:** Đăng nhập từng vai trò ở http://127.0.0.1:5173; mở F12 → Network, lọc /api/v1; xem login và GET hồ sơ.
- **Mong đợi:** Login 200 với user đúng vai trò; hồ sơ đúng người. Không đưa JWT/mật khẩu vào ảnh báo cáo chia sẻ.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G02 — Quyền thực sự tại API

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P0 / Quản lý và thành viên.
- **Chuẩn bị:** Dùng các request đã đăng nhập trong Network hoặc công cụ HTTP với token của đúng tài khoản.
- **Thao tác:** GET /api/v1/users với token quản lý rồi với token thành viên; login sai mật khẩu ở lượt riêng.
- **Mong đợi:** Danh sách: quản lý 200, thành viên 403; sai mật khẩu login 401. Không dùng giao diện demo online để kết luận điều này.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G03 — Frontend gửi form và SQL lưu thật

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P0 / Quản lý.
- **Chuẩn bị:** Backend/SQL hoạt động; dùng sportId/roomId/coachId tồn tại trong DB.
- **Thao tác:** Tạo lớp TEST_API_MOI qua form frontend; xem POST /classes trong Network, tải lại danh sách và đối chiếu lớp trong SQL.
- **Mong đợi:** POST 201; GET danh sách có lớp; bảng classes có đúng bản ghi. Đó mới là bằng chứng server nhận và lưu, không chỉ là toast.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G04 — Đặt/hủy/đặt lại và chống trùng ở server

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P0 / Thành viên.
- **Chuẩn bị:** Có lớp tương lai còn chỗ và tài khoản thành viên local.
- **Thao tác:** Đặt lớp, gửi lại cùng yêu cầu để kiểm tra trùng; hủy booking, đặt lại; kiểm tra Network và class_bookings.
- **Mong đợi:** Đặt 201, lặp đang BOOKED trả 400; hủy 200, đặt lại 201; số chỗ và bản ghi đúng.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G05 — Thu tiền và tổng từ API/SQL

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P0 / Lễ tân và quản lý.
- **Chuẩn bị:** Dùng hóa đơn và thành viên thử riêng; ghi tổng doanh thu R0 trước khi bắt đầu.
- **Thao tác:** Tạo invoice PENDING amount 123000, xác nhận pay; GET hóa đơn/doanh thu và đối chiếu bảng invoices.
- **Mong đợi:** Create 201, pay 200, hóa đơn PAID; tổng cùng khoảng tăng 123000 nếu không có giao dịch khác; SQL khớp.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G06 — Lỗi mạng không chuyển sang demo

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P1 / Bất kỳ.
- **Chuẩn bị:** Đăng xuất trước; ứng dụng vẫn ở API mode. Biết cách bật/tắt Request Blocking trong DevTools.
- **Thao tác:** Chỉ chặn mẫu _/api/v1/_ trong DevTools rồi thử đăng nhập; không chặn toàn bộ trang. Sau test tắt Request Blocking.
- **Mong đợi:** Hiện lỗi kết nối, không vào tài khoản mẫu/không báo lưu thành công. Ca mất mạng thật này chưa được chạy tay trước đây; test tự động đã mô phỏng fetch lỗi.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G07 — Quyền sở hữu hồ sơ

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P1 / Thành viên.
- **Chuẩn bị:** Biết ID của chính thành viên và một người dùng khác trong database thử.
- **Thao tác:** Dùng token MEMBER gọi GET /users/{id-cua-minh}, rồi GET /users/{id-nguoi-khac}.
- **Mong đợi:** Hồ sơ mình 200, người khác 403 theo controller hiện tại. Đây là ca bổ sung chưa nằm trong 28 request đã chạy.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

#### G08 — Cạnh tranh chỗ cuối cùng

- **Môi trường / ưu tiên / vai trò:** API LOCAL / P1 / Hai thành viên.
- **Chuẩn bị:** Có lớp còn đúng 1 chỗ và hai tài khoản API khác nhau; chỉ dùng môi trường SQL local thử.
- **Thao tác:** Gửi hai yêu cầu đặt lớp gần đồng thời qua công cụ HTTP; đọc lại capacity và số BOOKED trong SQL.
- **Mong đợi:** Tiêu chí nghiệp vụ cần đạt: chỉ một người thành công, BOOKED không vượt maxCapacity. CHƯA kiểm chứng backend hiện tại đáp ứng; nếu cả hai vào được thì ghi FAIL và chuyển nhóm backend xử lý, không tự coi UI disabled là đã bảo đảm.
- **Kết quả của bạn:** ☐ Chưa chạy ☐ PASS ☐ FAIL ☐ BLOCKED; thực tế/ảnh/ghi chú: …

## 5. Ghi nhận lỗi để gửi lại

```text
Mã ca: C07
Môi trường: Demo Vercel / API local
Vai trò và tài khoản: …
Trang URL: …
Thời gian xảy ra: …
Dữ liệu đã nhập / ID lớp, thành viên, hóa đơn: …
Các bước tái hiện: 1) … 2) … 3) …
Mong đợi: …
Thực tế: …
Ảnh màn hình: …
Nếu API local: method, đường dẫn, HTTP status và message; che token/mật khẩu.
Tải lại có còn lỗi không: …
```

Một lỗi nên có một mã ca và bộ bước tái hiện cụ thể. Trước khi khôi phục demo, chụp lại dữ liệu/ảnh cần giữ; sau khôi phục, lỗi có thể mất điều kiện để tái hiện.

## 6. Cách giải thích luồng khi bảo vệ

```text
Người dùng bấm nút / gửi form
→ trang pages/*.tsx nhận sự kiện và kiểm tra dữ liệu cơ bản
→ api.ts chọn API thật hoặc demo
→ API thật: request/fetch + JWT → backend → SQL → response
   Demo: xử lý bộ dữ liệu readDemo → localStorage
→ await thành công mới báo hoàn tất
→ invalidateQueries / cập nhật state
→ bảng, số chỗ, lịch hoặc báo cáo render lại
```

Xem thêm `docs/GIAI-THICH-FRONTEND.md` để lần từng file, payload, quyền và câu hỏi hội đồng. Chủ động phân biệt topic yêu cầu, UI hiện có, API đã nối và phần chỉ mô phỏng demo.
