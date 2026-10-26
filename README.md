# Sports Center Management System

## Run the API

Requirements: JDK 23 and SQL Server. For a new, empty SportsCenterDB, create the database and run [src/main/resources/db/schema.sql](src/main/resources/db/schema.sql) manually. Hibernate validates the resulting schema; the application does not create or migrate tables automatically.

The schema script is a fresh-install baseline. Do not run it as a migration against an existing database with data: the old V1 script used table and column names that do not match the current JPA model. Back up existing data and write a reviewed data migration before changing a live database. See [Database design](docs/DATABASE-DESIGN.md) for the ER model, changes, and migration notes.

In PowerShell, configure the database credentials and a Base64-encoded JWT secret of at least 32 random bytes, then start Spring Boot:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($bytes)
$env:DB_USERNAME = "sa"
$env:DB_PASSWORD = "your-local-database-password"
.\mvnw.cmd spring-boot:run
```

The defaults connect to SQL Server at `localhost:1433`, database `SportsCenterDB`, and listen on port `8080`. Override them with `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`, and `SERVER_PORT`. `JWT_EXPIRATION_MS` defaults to one hour. The development JWT secret in `application.yaml` must be replaced outside local development.

## Authentication

`POST /api/v1/users/register` creates a `MEMBER` account. `POST /api/v1/users/login` accepts an email and password, returning a user and JWT. Pass the token as `Authorization: Bearer <token>` to protected endpoints. Revenue reports at `/api/v1/reports/revenue` require the `CENTER_MANAGER` role. Seed the roles using the supplied database script; public registration intentionally cannot set a privileged role.

To grant the first manager, register a trusted account and have a database administrator update its `role_id` to the `CENTER_MANAGER` role from `roles`; do not expose role promotion through a public endpoint.

Packages and classes use access levels: STANDARD packages can book STANDARD classes; VIP packages can book STANDARD and VIP classes. Classes do not have a separate booking price. The baseline seeds the five roles used by the code: MEMBER, COACH, RECEPTIONIST, MANAGER, and CENTER_MANAGER. It also adds Cầu lông, Bóng rổ, and Bơi lội as sample sports so classes can be created for them. The payment-provider catalog includes VNPay, MoMo, ZaloPay, and PayOS; all are disabled until real gateway integrations and credentials are configured.

To add sample sports, rooms, and six scheduled classes (including two VIP classes), first run `src/main/resources/db/schema.sql`, create at least one active COACH account through the application, then run `src/main/resources/db/sample-classes.sql`. The sample class script assigns all sample classes to the first active coach and schedules them on consecutive days starting tomorrow.

## Main API routes

| Area | Routes |
| --- | --- |
| Users | `POST /api/v1/users/register`, `POST /api/v1/users/login`, `GET /api/v1/users`, `GET /api/v1/users/{userId}`, `PATCH /api/v1/users/{userId}/status` |
| Classes and bookings | `GET/POST /api/v1/classes`, `GET /api/v1/classes/available`, `PUT /api/v1/classes/{classId}`, `POST /api/v1/classes/{classId}/cancel`, `POST /api/v1/classes/{classId}/book?memberId={memberId}` |
| Memberships | `POST /api/v1/memberships/subscribe`, `GET /api/v1/memberships/members/{memberId}`, `POST /api/v1/memberships/{subscriptionId}/renew?packageId={packageId}`, `POST /api/v1/memberships/{subscriptionId}/cancel` |
| Attendance | `POST /api/v1/attendance`, `GET /api/v1/attendance/classes/{classId}`, `GET /api/v1/attendance/members/{memberId}?startDate=2026-10-01&endDate=2026-10-31` |
| Payments and reports | `POST /api/v1/payments/invoices`, `POST /api/v1/payments/invoices/{invoiceId}/pay`, `POST /api/v1/payments/invoices/{invoiceId}/refund`, `GET /api/v1/reports/revenue?startDate=2026-10-01T00:00:00&endDate=2026-10-31T23:59:59` |

All APIs except registration and login require a valid bearer token. IDs and request fields follow the existing entity and DTO definitions.
