# Database design — Sports Center Management System

## 1. Current database review

The project is configured for SQL Server and Hibernate uses ddl-auto: validate, so the application expects tables to exist before startup. The repository only had V1__core_flows.sql; the project does not include Flyway, so that file was not being applied automatically.

The old SQL does not match the current JPA entities. Examples:

| Current code expects | Old SQL defined |
| --- | --- |
| users.user_id, users.role_id and a roles table | users.id and a text role; no matching roles table |
| membership_packages, member_subscriptions | memberships, user_memberships |
| classes.class_id, class_name, sport_id, coach_id, room_id, schedule_time | a different classes shape plus a separate class_schedules table |
| invoice subscription_id, member_id, amount, payment_status | user_membership_id, user_id, total_amount, and no payment status |
| class_bookings with status BOOKED/CANCELLED | class_enrollments with status REGISTERED/CANCELLED |

As a result, a fresh database created from the old SQL is not a reliable schema for this application. The old script also had a dangling conditional around its sample package insert.

## 2. Quan hệ database hiện tại

Sơ đồ trong ảnh là phiên bản cũ/rút gọn. Nó mô tả đúng các quan hệ lõi như `users`–`roles`, đăng ký gói, lớp học, booking và điểm danh, nhưng chưa phản ánh đầy đủ backend 106 file Java. Cụ thể, ảnh đang thiếu `access_level` của gói, `required_access_level` của lớp, các cột tiền tệ/thời điểm thanh toán của hóa đơn và các bảng thanh toán, phản hồi, hỗ trợ, kế hoạch/nhật ký tập luyện.

Dùng sơ đồ dưới đây làm bản chuẩn cho schema hiện tại. Ký hiệu `o|--o|` ở quan hệ đăng ký gói–hóa đơn thể hiện cả hai phía đều có thể không liên kết: hóa đơn thủ công không cần subscription, còn subscription chỉ có tối đa một hóa đơn nhờ unique filtered index trên `invoices.subscription_id`.

```mermaid
erDiagram
    ROLES ||--o{ USERS : role_id
    USERS ||--o| MEMBER_PROFILES : member_id
    SPORTS ||--o{ CLASSES : sport_id
    ROOMS ||--o{ CLASSES : room_id
    USERS ||--o{ CLASSES : coach_id
    USERS ||--o{ MEMBER_SUBSCRIPTIONS : member_id
    MEMBERSHIP_PACKAGES ||--o{ MEMBER_SUBSCRIPTIONS : package_id
    MEMBER_SUBSCRIPTIONS o|--o| INVOICES : subscription_id
    USERS ||--o{ INVOICES : member_id
    USERS o|--o{ INVOICES : receptionist_id
    INVOICES ||--o{ PAYMENT_TRANSACTIONS : invoice_id
    PAYMENT_PROVIDERS ||--o{ PAYMENT_TRANSACTIONS : provider
    PAYMENT_TRANSACTIONS o|--o{ PAYMENT_TRANSACTIONS : related_transaction_id
    USERS ||--o{ CLASS_BOOKINGS : member_id
    CLASSES ||--o{ CLASS_BOOKINGS : class_id
    USERS ||--o{ ATTENDANCES : member_id
    USERS ||--o{ ATTENDANCES : checked_in_by
    CLASSES ||--o{ ATTENDANCES : class_id
    USERS ||--o{ FEEDBACKS : from_user_id
    USERS o|--o{ FEEDBACKS : to_user_id
    CLASSES o|--o{ FEEDBACKS : class_id
    USERS ||--o{ SUPPORT_TICKETS : member_id
    USERS o|--o{ SUPPORT_TICKETS : resolved_by
    USERS ||--o{ WORKOUT_PLANS : coach_id
    USERS o|--o{ WORKOUT_PLANS : member_id
    CLASSES o|--o{ WORKOUT_PLANS : class_id
    USERS ||--o{ WORKOUT_LOGS : member_id
    USERS ||--o{ WORKOUT_LOGS : coach_id
    CLASSES o|--o{ WORKOUT_LOGS : schedule_id
    WORKOUT_LOGS ||--o{ WORKOUT_LOG_DETAILS : log_id

    ROLES {
        int role_id PK
        string role_name UK
    }
    USERS {
        int user_id PK
        string email UK
        string password_hash
        string full_name
        string phone UK
        int role_id FK
        string status
        datetime created_at
    }
    MEMBER_PROFILES {
        int member_id PK, FK
        date dob
        string gender
        string address
        string fitness_goals
    }
    SPORTS {
        int sport_id PK
        string sport_name UK
        string description
    }
    ROOMS {
        int room_id PK
        string room_name UK
        int capacity
    }
    MEMBERSHIP_PACKAGES {
        int package_id PK
        string package_name
        int duration_days
        decimal price
        string access_level
        string description
        string status
    }
    CLASSES {
        int class_id PK
        string class_name
        int sport_id FK
        int coach_id FK
        int room_id FK
        int max_capacity
        datetime schedule_time
        int duration_minutes
        string required_access_level
        string status
    }
    MEMBER_SUBSCRIPTIONS {
        int subscription_id PK
        int member_id FK
        int package_id FK
        date start_date
        date end_date
        string status
    }
    CLASS_BOOKINGS {
        int booking_id PK
        int class_id FK
        int member_id FK
        datetime booked_at
        string status
    }
    INVOICES {
        int invoice_id PK
        int subscription_id FK, UK
        int member_id FK
        int receptionist_id FK
        decimal amount
        string currency
        string payment_method
        string payment_status
        datetime created_at
        datetime paid_at
        datetime refunded_at
    }
    PAYMENT_PROVIDERS {
        string provider_code PK
        string display_name
        boolean is_enabled
        datetime created_at
    }
    PAYMENT_TRANSACTIONS {
        int payment_transaction_id PK
        int invoice_id FK
        string provider FK
        string transaction_type
        string order_reference UK
        string provider_transaction_reference UK
        int related_transaction_id FK
        decimal amount
        string currency
        string status
        string provider_response_code
        datetime created_at
        datetime expires_at
        datetime completed_at
    }
    ATTENDANCES {
        int attendance_id PK
        int class_id FK
        int member_id FK
        int checked_in_by FK
        datetime checked_in_at
        string status
    }
    FEEDBACKS {
        int id PK
        int from_user_id FK
        int to_user_id FK
        int class_id FK
        int rating
        string comment
        string type
        datetime created_at
    }
    SUPPORT_TICKETS {
        int id PK
        int member_id FK
        string subject
        string content
        string status
        string response
        int resolved_by FK
        datetime created_at
        datetime resolved_at
    }
    WORKOUT_PLANS {
        int id PK
        string title
        int coach_id FK
        int member_id FK
        int class_id FK
        string description
        datetime created_at
    }
    WORKOUT_LOGS {
        int id PK
        int member_id FK
        int coach_id FK
        int schedule_id FK
        string feedback_from_coach
        datetime created_at
    }
    WORKOUT_LOG_DETAILS {
        int id PK
        int log_id FK
        string exercise_name
        int sets
        int reps
        decimal weight_kg
    }
```

Lớp không có giá riêng. Gói `STANDARD` đăng ký được lớp `STANDARD`; gói `VIP` đăng ký được cả lớp `STANDARD` và `VIP`. Booking chỉ lưu chỗ đăng ký, còn thanh toán online theo hóa đơn của gói hội viên.
## 3. Membership access and payment decisions

- Classes do not have a separate booking fee. Revenue comes from selling or renewing a membership package.
- Membership packages have an `access_level`: `STANDARD` or `VIP`. A class has a `required_access_level`: `STANDARD` or `VIP`.
- A valid active STANDARD membership grants access to STANDARD classes. VIP grants access to both STANDARD and VIP classes.
- Booking a class creates a `BOOKED` reservation directly after the service checks the member's active, unexpired subscription, access level, capacity, schedule and duplicate booking. No class invoice or payment hold is created.
- An invoice is linked to a membership subscription through `subscription_id`, or represents a manual charge. Online payment attempts are for package invoices.
- Schema đã có `payment_transactions` để lưu lần thử thanh toán/hoàn tiền và mã tham chiếu của cổng. Khi tích hợp gateway, callback phải được xác minh trước khi cập nhật hóa đơn thành `PAID` và kích hoạt subscription; flow callback này hiện chưa có trong code.
- Khi flow gateway được hoàn thiện, các lần thử thất bại/hết hạn cần được lưu để đối soát; hóa đơn có thể tiếp tục `PENDING` để thử lại.
- The provider catalog contains VNPay, MoMo, ZaloPay and PayOS. Seed entries start disabled; each provider still needs credentials, request signing, callback verification and sandbox checks before enabling.
## 4. Tables

| Table | Purpose |
|---|---|
| roles, users, member_profiles | Accounts, access role and member profile |
| sports, rooms, classes | Sport catalog, rooms, scheduled classes and required access level |
| membership_packages, member_subscriptions | Package price/access level, duration and a member's active period |
| class_bookings | A member's confirmed or cancelled place in a class |
| invoices | Amount owed for a membership subscription or manual charge |
| payment_providers | Gateway catalog and whether its backend integration is enabled |
| payment_transactions | Individual package payment/refund attempts and provider references |
| attendances | Attendance record, unique per member and class |
| feedbacks, support_tickets | Member feedback and support requests |
| workout_plans, workout_logs, workout_log_details | Coach plans and recorded exercise results |
## 5. Key constraints and indexes

- Foreign keys connect members, roles, coaches, sports, rooms, subscriptions, bookings and invoices.
- Package and class access levels are constrained to `STANDARD` or `VIP`; service logic grants VIP access to both levels.
- Class capacity and duration are validated; the service must ensure a coach and room are not double-booked.
- A class/member pair has one booking row. After cancellation, application logic can reuse the existing row if the member books again.
- Attendance is unique per class/member so concurrent requests cannot create duplicate check-ins.
- An invoice can point to a membership subscription or be a manual charge. Class bookings do not create invoices.
- A membership invoice can have multiple payment transaction attempts.
- Gateway order references and non-null provider transaction references are unique for idempotent callback handling.
- Provider seed records for VNPay, MoMo, ZaloPay and PayOS are disabled until their backend integrations and credentials are ready.
- The database checks values and relationships, while the service must still enforce rules such as “selected user has the COACH role,” “membership is active and unexpired,” “membership access level meets the class requirement,” and “class has places left.”
## 6. Schema file and migration safety

`src/main/resources/db/schema.sql` is the schema-only baseline; `src/main/resources/db/recreate-sports-center-sql2019.sql` creates a new SportsCenterDB, installs this schema, and adds table descriptions. Both target a new/empty database. It includes membership/class access levels and online payment structures for package invoices. It does not add a class price or class-linked invoice.

This script does not alter or migrate existing tables. For a database that already has data:

1. Back up the database.
2. Compare the real database columns/data with this design.
3. Add `access_level` to packages and `required_access_level` to classes, backfilling existing rows as `STANDARD`.
4. Remove any previously introduced class price, booking price/checkout fields, and invoice-to-booking relation only after confirming no live data depends on them.
5. Validate the migration against a disposable copy before switching the application.

The schema is run manually and is not applied automatically at startup. The project uses Hibernate validation; it is not a migration tool.

## 7. Current code versus database design

The Java entities and service logic use `access_level` on membership packages and `required_access_level` on classes. Booking checks that the member has an active, unexpired package with sufficient access; classes do not have a separate price.

The current payment API handles manual invoices and payment status updates. `payment_providers` and `payment_transactions` prepare the schema for gateway transactions, but VNPay/MoMo/ZaloPay/PayOS checkout creation, signature validation, callbacks and refunds are not integrated. Provider rows therefore remain disabled.
