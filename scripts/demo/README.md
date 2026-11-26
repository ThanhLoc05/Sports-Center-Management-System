# Waitlist-only demo launcher

Run from the repository root with JDK 27 and an existing SQL Server demo or isolated QA database on the current schema. This launcher registers only `WaitlistJobs.advanceWaitlists` as a Spring scheduled job. It uses the existing waitlist expiry and offer logic and keeps the existing SSE heartbeat and immediate notification delivery.

The first poll can expire outstanding invitations, notify affected members and offer any released seats in queue order. Check the pending waitlist and verify a database backup before launching against shared demo data.

Supply `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` and `JWT_SECRET` in the process environment using your local configuration. Integrated SQL Server authentication can use empty username and password. Set `SPORTIVA_WAITLIST_DATABASE` to the exact catalog named in `DB_URL`. Keep JDBC native authentication on the Java library path if your connection requires it.

```powershell
$env:SEPAY_WEBHOOK_ENABLED = 'false'
$env:SPORTIVA_WAITLIST_DATABASE = 'SportivaDemo_Final'
Push-Location backend
try {
    & .\mvnw.cmd -DskipTests package
} finally {
    Pop-Location
}
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }

$appJar = (Get-Item backend/target/SportsCenter-0.0.1-SNAPSHOT.jar).FullName
$launcher = (Get-Item scripts/demo/WaitlistOnlyLaunch.java).FullName
$runtime = Join-Path ([System.IO.Path]::GetTempPath()) ('sportiva-waitlist-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $runtime | Out-Null
Push-Location $runtime
try {
    & jar xf $appJar BOOT-INF/classes BOOT-INF/lib
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract backend classes' }
    & javac -cp 'BOOT-INF/classes;BOOT-INF/lib/*' -d . $launcher
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the waitlist-only launcher' }
} finally {
    Pop-Location
}

& java "-Dloader.path=$runtime" '-Dloader.main=WaitlistOnlyLaunch' -cp $appJar org.springframework.boot.loader.launch.PropertiesLauncher `
    --server.address=127.0.0.1 --server.port=18083 `
    --spring.jpa.hibernate.ddl-auto=validate --spring.sql.init.mode=never `
    --spring.flyway.enabled=false --spring.liquibase.enabled=false --app.demo.flow4.enabled=false `
    --app.training.scheduling-enabled=false --app.me09.scheduling-enabled=false `
    --app.booking.waitlist-worker-enabled=true --app.booking.waitlist-poll-ms=30000 `
    --membership.payment.webhook-enabled=false
```

Startup reports `Scheduled jobs: [com.sportscenter.management.service.WaitlistJobs.advanceWaitlists]`. Use the SQL Server session and application logs to verify the intended database and poll results. Run the regular backend entry point for other environments.
