# Isolated security regression tests

These opt-in tests write fixtures only to `DESKTOP-IKVPEK1\SQLEXPRESS / SportivaSecurity_20261112`.
They never target `SportsCenterDB_Local_9156ce8`. Keep existing application processes unchanged.
Do not point the isolated frontend at an application backend.

Prerequisites: Node matching package.json, `npm ci`, Google Chrome (runner uses channel `chrome`),
JDK27, SQL Server Windows Authentication, JDBC13.6 native x64 library on the Java library path.
Playwright is pinned in package-lock.json. No user credentials or saved browser session are required:
the Java test creates random isolated fixture accounts and passes credentials to its child in memory.

## Test database

On first preparation, verify the exact SQL instance and that `SportivaSecurity_20261112` does not exist.
Stop if the name already exists unexpectedly; do not overwrite, restore or delete it.
Create the new catalog only after that guard. In that catalog, apply these repository scripts in order:

1. `backend/src/main/resources/db/schema.sql`
2. `backend/src/main/resources/db/migration/V9__general_notification_history.sql`
3. `backend/src/main/resources/db/migration/V11__member_notification_outbox.sql`
4. `backend/src/main/resources/db/migration/V12__member_email_verification.sql`

Use sqlcmd `-E -I -b -f 65001`, exact instance/database guards and these session settings:
ANSI_NULLS, ANSI_PADDING, ANSI_WARNINGS, ARITHABORT, CONCAT_NULL_YIELDS_NULL, QUOTED_IDENTIFIER ON;
NUMERIC_ROUNDABORT OFF. Never copy application data. For an already approved test catalog, verify its
name/schema, then reuse it: tests use new fixture identities and retain evidence instead of deleting data.

## Run Chrome and HTTP/SQL tests

Verify ports8082/5175 are free before starting the test environment. If occupied unexpectedly, stop.
From the repository root, start a separate frontend terminal:

```powershell
$env:VITE_DATA_MODE = 'api'
$env:VITE_API_BASE_URL = ''
$env:API_PROXY_TARGET = 'http://127.0.0.1:8082'
npm run dev -- --port 5175 --strictPort
```

In a second terminal, configure JAVA_HOME/JAVA_TOOL_OPTIONS for your installed JDK27/native JDBC library.
Do not load the application's `.env.backend.local`. The tests declare their isolated database explicitly.
Optionally supply a fresh random JWT_SECRET only to this test terminal; never print or commit it.
Then, from `backend/`:

```powershell
.\mvnw.cmd -B '-Dmssql-jdbc.version=13.6.0.jre11' `
  '-Dtest=ProfileJwtConcurrencySqlServerIT,ProfileJwtOsivSqlServerIT,BookingConcurrencySqlServerIT,SecurityRoleFlowsSqlServerIT' `
  '-Dsportiva.security-sql=true' '-Dsportiva.security-chrome=true' test
```

The HTTP test starts its own backend on8082; the profile race test uses a random loopback port.
Database repositories and transactions are real; mail is mocked, gateway calls are not made.
Chrome is launched headlessly and closed by the runner. Credentials, Authorization and response bodies
are not written to evidence. Only paths, status codes, assertions and post-login screenshots are recorded.
On failure the runner writes an error type, not a Playwright call log containing filled credentials.

No external helper path/property is needed. `SecurityRoleFlowsSqlServerIT` resolves
`scripts/tests/security-role-flows.mjs` relative to this checkout.
Evidence defaults to a new directory under the operating system temporary directory; the test prints
its browser log path, which contains `SECURITY_CHROME_EVIDENCE=<directory>`.
To choose another directory outside this repository, pass `-Dsportiva.evidence-dir=<absolute-directory>`.
Never commit logs, screenshots, account data or local configuration.

Without the opt-in flags these SQL/browser tests are disabled. `SecurityPolicyProposalTest` is a separate
test-only proposal, not an enabled login/CORS/deployment policy and not required for the security fix commit.
