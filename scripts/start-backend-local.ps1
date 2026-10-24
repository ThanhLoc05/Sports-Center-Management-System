$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeFile = Join-Path $projectRoot '.env.backend.local'
if (-not (Test-Path -LiteralPath $runtimeFile)) {
    throw 'Missing .env.backend.local with DB_URL, DB_USERNAME, DB_PASSWORD and JWT_SECRET.'
}
foreach ($line in Get-Content -LiteralPath $runtimeFile) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
Push-Location (Join-Path $projectRoot 'backend')
try {
    & .\mvnw.cmd '-Djava.version=17' 'spring-boot:run'
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
