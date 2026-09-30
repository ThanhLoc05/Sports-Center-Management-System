# Sports-Center-Management-System

## Run locally

1. Create the `SportsCenterDB` database in SQL Server and set `DB_USERNAME`, `DB_PASSWORD`, and `JWT_SECRET`.
2. Start the app with `.\mvnw.cmd spring-boot:run`.
3. Open Swagger UI at `http://localhost:8080/swagger-ui/index.html`.

The first Flyway migration creates the flow tables and starter catalog data (membership packages, rooms and classes). `baseline-on-migrate` is enabled at version `0` to handle the existing non-empty `dbo` schema reported by the project. Flyway records applied migrations in `dbo.flyway_schema_history`. The migration only creates tables that are missing and does not drop tables or rows. Back up an existing database first; if it already has tables with the same names but a different structure, reconcile those columns before using the APIs.

When `SEED_DEMO_DATA=true`, startup adds one manager, receptionist, coach and member, an active member package/invoice, and two upcoming class schedules. Each seeded account uses password `ChangeMe123!`:

| Role | Username |
| --- | --- |
| Manager | `manager@sportscenter.local` |
| Receptionist | `reception@sportscenter.local` |
| Coach | `coach@sportscenter.local` |
| Member | `member@sportscenter.local` |

Demo data is controlled by `app.seed-demo-data` / `SEED_DEMO_DATA`; set it to `false` in production because these known development credentials must not be enabled there. The API uses stateless JWT authentication. `JWT_SECRET` must be a Base64-encoded secret of at least 32 random bytes; never use or commit a real production secret in source control. Tokens expire after 15 minutes by default (`JWT_EXPIRATION_MS`). Use HTTPS outside local development.

## Registration and login by account type

- Public `POST /api/auth/register` always creates a `MEMBER`; the request cannot choose a role.
- A `MANAGER` creates staff accounts through `POST /api/users`, setting `role` to `MANAGER`, `COACH`, `RECEPTIONIST`, or `MEMBER`. Access is protected by role authorization.
- Login is `POST /api/auth/login` with an email and password JSON body. On success it returns `accessToken`, `expiresInMillis`, and the current account. Send the token as `Authorization: Bearer <accessToken>` on protected API requests. `GET /api/auth/me` returns the current account.
- To log out, the client discards its access token. There is no refresh-token or server-side revocation endpoint in this MVP, so a token already issued remains valid until its short expiry.

For a fresh production database without demo seeding, register the first trusted manager as a member, then have a trusted database administrator promote that exact account once:

```sql
UPDATE dbo.users
SET role = 'MANAGER'
WHERE email = 'first.manager@example.com' AND role = 'MEMBER';
```

The update must affect exactly one row. The account can then log in and provision the other roles through `POST /api/users`. Do not expose this promotion as a public API.

Example public member registration:

```powershell
curl.exe -X POST http://localhost:8080/api/auth/register `
  -H "Content-Type: application/json" `
  -d '{"email":"new.member@example.com","password":"AtLeast8Characters","fullName":"Nguyen Van A","phone":"0900000000"}'
```

Example login and manager-created coach (replace the seeded manager credentials when using another manager account):

```powershell
$login = curl.exe -s -X POST http://localhost:8080/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"manager@sportscenter.local","password":"ChangeMe123!"}' | ConvertFrom-Json
$token = $login.accessToken

curl.exe -X POST http://localhost:8080/api/users `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d '{"email":"coach2@example.com","password":"AtLeast8Characters","fullName":"Coach Two","role":"COACH"}'
```

Generate a local development signing secret in PowerShell before starting the app:

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

This generates a new secret each time that command is run, invalidating tokens from the previous run. For a stable local secret, store it in your IDE's environment-variable run configuration or a local PowerShell script excluded from source control; never commit it.

## Package layout

`config` contains Spring Security, CORS and OpenAPI configuration. `auth` owns login/registration, database-backed user details and JWT issuance/filtering. Business HTTP controllers, services and request DTOs are grouped under `user`, `classes`, `membership`, `attendance` and `workout`; shared JDBC validation helpers and API exception responses are under `common`. Membership expiry is part of `membership`. The application uses `JdbcTemplate`/SQL Server rather than JPA entities. `ai`, `notification` and `audit` are package scaffolds only; their integrations and workflows have not been implemented.

## API flows

| Flow | Main routes | Roles |
| --- | --- | --- |
| 1. Users and memberships | `POST /api/auth/register`, `GET /api/auth/me`, `GET/PUT /api/members/me/profile`, `GET /api/members?query=...`, `GET/POST /api/users`, `PATCH /api/users/{id}/status`, `GET/POST /api/memberships`, `POST /api/memberships/subscribe`, `GET /api/memberships/mine` | Public registration/catalog; Manager manages accounts/packages; Member manages own profile; Receptionist can search members and sell a package |
| 2. Class booking and schedules | `GET /api/classes`, `POST /api/classes`, `GET/POST /api/rooms`, `GET/POST /api/classes/schedules`, `POST /api/classes/schedules/{id}/enroll`, `GET /api/classes/enrollments/mine`, `POST /api/classes/enrollments/{id}/cancel` | Public class/schedule catalog; Manager configures; Member books/cancels; Receptionist can book for a member |
| 3. Payments and reports | `GET /api/invoices`, `GET /api/memberships/invoices/mine`, `GET /api/reports/revenue?from=2026-09-01&to=2026-09-30` | Manager/Receptionist see invoices; Manager sees revenue reports; Member sees own invoices |
| 4. Training and attendance | `GET /api/coaching/schedules`, `GET /api/coaching/schedules/{id}/members`, `POST /api/attendance`, `POST /api/attendance/check-in`, `POST /api/workouts/plans`, `POST /api/workouts/logs`, `GET /api/attendance/mine`, `GET /api/workouts/plans/mine`, `GET /api/workouts/logs/mine` | Coach records class attendance and training; Receptionist checks members in; Member views personal training history |

Membership subscription creates an active membership and invoice in one database transaction. This MVP records the selected payment method; it does not connect to a payment gateway or process card/bank transactions. Class enrollment requires a currently valid membership, prevents duplicate bookings, checks class capacity and serializes bookings for the same schedule.

Schedule request times use local `yyyy-MM-ddTHH:mm:ss` values. Common request shapes:

```json
{
  "email": "member@example.com",
  "password": "AtLeast8Characters",
  "fullName": "Nguyen Van A",
  "phone": "0900000000",
  "fitnessGoal": "Improve endurance"
}
```

```json
{
  "membershipId": 2,
  "paymentMethod": "CASH"
}
```

For receptionist package sales, include the target `"memberId"` in the second request. Coaches record attendance with `{"memberId": 4, "scheduleId": 1, "status": "PRESENT"}`. Validation errors return HTTP 400, duplicate/conflicting data returns HTTP 409, and role checks are enforced on the API.

## Creating and linking Flyway migrations

1. Put versioned SQL files in `src/main/resources/db/migration`, for example `V2__add_member_emergency_contact.sql`. Use the next unused version; the existing `V1__core_flows.sql` is the starting migration.
2. For a schema change, write SQL Server DDL in that file. To add a column, use `ALTER TABLE ... ADD ...`; to add a table, create it and its foreign keys/indexes there. To insert reference rows, make inserts repeatable (for example `IF NOT EXISTS`). Do not edit a migration that has already been applied to a database; add a new version instead.
3. Restart the app. Spring Boot runs Flyway before creating the application services; successful versions and checksums appear in `dbo.flyway_schema_history`. The database is accessed with `JdbcTemplate`, so there is no JPA entity scan or `ddl-auto` step to link. New columns/tables become usable after the corresponding domain service and API methods are updated to read/write them.
4. For a database that was already non-empty before Flyway, the configured baseline version is `0`; Flyway records that baseline, then applies V1 and subsequent migrations. If a schema-history table already exists, Flyway uses its recorded state instead of baselining again. Never delete that history table or modify applied migration files to force a migration.

Example follow-up migration:

```sql
IF COL_LENGTH('dbo.member_profiles', 'preferred_training_time') IS NULL
    ALTER TABLE dbo.member_profiles ADD preferred_training_time NVARCHAR(50) NULL;
```

Keep database credentials in environment variables (`DB_USERNAME`, `DB_PASSWORD`), not in migration files or source control.
