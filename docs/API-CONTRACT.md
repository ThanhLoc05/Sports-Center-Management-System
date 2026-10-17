# Contract frontend ↔ nhánh BE

Prefix `/api/v1`. Nguồn ưu tiên: `backend/src/main/java/com/sportscenter/management/controller` và `dto`. FE gateway: `src/lib/api.ts`. Swagger gốc được giữ để đối chiếu, không gọi SwaggerHub mock server làm backend thật.

## Model chính

```ts
User = {id, email, fullName, phone, roleName, status}
LoginResponse = {token, user: User}
Class = {id, className, sportId, coachId, roomId, maxCapacity,
         scheduleTime, durationMinutes, status}
Booking = {id, classId, memberId, bookedAt, status}
Subscription = {id, memberId, packageId, startDate, endDate, status}
Attendance = {id, classId, memberId, checkedInBy, checkedInAt, status}
Invoice = {id, subscriptionId?, memberId, receptionistId?, amount,
           paymentMethod, paymentStatus, createdAt}
```

ID và capacity là số nguyên; amount là số VND từ BigDecimal JSON, không parse formatted currency. Date là `YYYY-MM-DD`; LocalDateTime là `YYYY-MM-DDTHH:mm:ss` theo thời gian trung tâm GMT+7, không thêm `Z` vào query BE. FE có `parseDate` để không phụ thuộc timezone thiết bị khi hiển thị.

## Những route dùng trong luồng FE

| Method | Path (bỏ prefix)                        | Input / dữ liệu                                                                          |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| POST   | `/users/register`                       | `{email,password,fullName,phone}`, luôn tạo MEMBER                                       |
| POST   | `/users/login`                          | `{email,password}` → `{token,user}`                                                      |
| GET    | `/users`                                | `roleId?` (FE lấy list rồi lọc), manager only                                            |
| GET    | `/users/{userId}`                       | owner/manager                                                                            |
| PATCH  | `/users/{userId}/status`                | query `status=ACTIVE/INACTIVE/BLOCKED`                                                   |
| GET    | `/classes`                              | `sportId?`, `coachId?`; coach FE gửi ID bản thân                                         |
| POST   | `/classes`                              | ClassRequest không có id                                                                 |
| PUT    | `/classes/{classId}`                    | ClassRequest                                                                             |
| POST   | `/classes/{classId}/cancel`             | hủy lớp và booking                                                                       |
| GET    | `/classes/{classId}/capacity`           | integer chỗ còn lại                                                                      |
| POST   | `/classes/{classId}/book`               | **query `memberId`**, không JSON body                                                    |
| GET    | `/classes/{classId}/bookings`           | Booking[]                                                                                |
| GET    | `/members/{memberId}/bookings`          | Booking[]                                                                                |
| DELETE | `/bookings/{bookingId}`                 | BookingResponse trong BE; wrapper chấp nhận cả empty success                             |
| POST   | `/memberships/subscribe`                | `{memberId,packageId}`; ngày do BE quyết định                                            |
| GET    | `/memberships/members/{memberId}`       | Subscription[]                                                                           |
| POST   | `/memberships/{subscriptionId}/renew`   | query `packageId`                                                                        |
| POST   | `/memberships/{subscriptionId}/cancel`  | cancel active subscription                                                               |
| POST   | `/attendance`                           | `{classId,memberId,checkedInBy,status}`                                                  |
| GET    | `/attendance/classes/{classId}`         | Attendance[]; FE lọc khoảng ngày nếu cần                                                 |
| GET    | `/attendance/members/{memberId}`        | query `startDate`, `endDate` (date)                                                      |
| POST   | `/payments/invoices`                    | `{memberId,subscriptionId?,receptionistId,amount,paymentMethod,paymentStatus:'PENDING'}` |
| GET    | `/payments/invoices/pending`            | staff pending list                                                                       |
| GET    | `/payments/members/{memberId}/invoices` | Invoice[] của member                                                                     |
| POST   | `/payments/invoices/{invoiceId}/pay`    | đánh dấu PAID                                                                            |
| POST   | `/payments/invoices/{invoiceId}/refund` | đánh dấu REFUNDED, manager only                                                          |
| GET    | `/payments/revenue`                     | startDate/endDate LocalDateTime → number                                                 |
| GET    | `/payments/revenue/by-method`           | startDate/endDate → plain text method totals                                             |

Các route có trong BE nhưng FE không cần gọi riêng vì đã có dữ liệu tương đương: `GET /classes/available`, `GET /classes/{id}`, `GET /bookings/{id}`, `GET /memberships/members/{id}/active`, `/expiration`, `GET /attendance/{id}`, `/classes/{id}/absentees`, `/members/{id}/rate`, `/count`, `GET /payments/invoices/{id}`, `GET /reports/revenue` (CENTER_MANAGER-only, cùng service doanh thu). Không giả định có list-all booking/subscription/invoice.

Payment method BE: `CASH`, `BANK_TRANSFER`, `CREDIT_CARD`, `VNPAY`. Status: user `ACTIVE/INACTIVE/BLOCKED`; class `SCHEDULED/COMPLETED/CANCELLED`; booking `BOOKED/CANCELLED`; membership `ACTIVE/EXPIRED/CANCELLED`; attendance `PRESENT/ABSENT`; invoice `PENDING/PAID/REFUNDED`.

## Xử lý lỗi

- `400`: hiển thị JSON `{message}` của ApiExceptionHandler, giữ form để sửa.
- `401`: với token API hiện tại, phát sự kiện xóa session, query cache và quay về login. Login sai không tạo session.
- `403`: báo không đủ quyền, không đổi role/fallback.
- `404`: báo không tìm thấy; membership history empty xử lý như không có gói.
- `409`, `429`, `5xx`, network failure và timeout có thông báo riêng.
- Không log token/password/API payload. Không retry mutation tự động.
- JSON collection phải là array. HTML từ proxy nhầm được báo lỗi cấu hình.

FE validation hỗ trợ người dùng; backend vẫn phải xác thực quyền, giá, trạng thái và ràng buộc nghiệp vụ.
