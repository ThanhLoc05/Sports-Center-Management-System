param(
    [Parameter(Mandatory)][string]$Server,
    [Parameter(Mandatory)][ValidatePattern('^SportivaDemo_[A-Za-z0-9_]+$')][string]$Database
)

$ErrorActionPreference = 'Stop'
if ($Database -eq 'SportivaDemo_Final') { throw 'Select a personal demo database.' }
$builder = [Data.SqlClient.SqlConnectionStringBuilder]::new()
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $Database
$builder['Integrated Security'] = $true
$builder['Encrypt'] = $true
$builder['TrustServerCertificate'] = $true
$connection = [Data.SqlClient.SqlConnection]::new($builder.ConnectionString)
$folder = Join-Path $PSScriptRoot '../../backend/src/main/resources/db'

function Invoke-SqlBatches([string]$Sql) {
    foreach ($batch in ($Sql -split '(?im)^\s*GO\s*(?:--[^\r\n]*)?\r?$')) {
        if (!$batch.Trim()) { continue }
        $command = $connection.CreateCommand()
        try {
            $command.CommandTimeout = 120
            $command.CommandText = $batch
            $null = $command.ExecuteNonQuery()
        } finally {
            $command.Dispose()
        }
    }
}

try {
    $connection.Open()
    $guard = $connection.CreateCommand()
    try {
        $guard.CommandText = "IF DB_NAME() <> @database OR EXISTS (SELECT 1 FROM sys.tables) THROW 51000, 'Select the approved empty personal demo database.', 1;"
        $null = $guard.Parameters.AddWithValue('@database', $Database)
        $null = $guard.ExecuteNonQuery()
    } finally {
        $guard.Dispose()
    }
    $schema = Get-Content -LiteralPath "$folder/schema.sql" -Raw -Encoding UTF8
    $legacyCatalog = '(?s)/\* Database [^\r\n]*?\*/\s*IF NOT EXISTS \(SELECT 1 FROM dbo\.users\).*?(?=IF NOT EXISTS \(SELECT 1 FROM dbo\.payment_providers)'
    if ([regex]::Matches($schema, $legacyCatalog).Count -ne 1) {
        throw 'Base schema catalog boundary changed. Review before initializing.'
    }
    Invoke-SqlBatches ([regex]::Replace($schema, $legacyCatalog, ''))
    foreach ($version in @('9', '11', '12', '15.1', '17', '18', '19', '22', '23', '24', '25', '26', '27')) {
        $script = @(Get-ChildItem -LiteralPath "$folder/migration" -Filter "V${version}__*.sql")
        if ($script.Count -ne 1) { throw "Expected one migration for V$version." }
        Invoke-SqlBatches (Get-Content -LiteralPath $script[0].FullName -Raw -Encoding UTF8)
        Write-Output $script[0].Name
    }
} finally {
    $connection.Dispose()
}
