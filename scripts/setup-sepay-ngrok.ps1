# Cấu hình một lần; đọc Authtoken ẩn và chỉ lưu vào thư mục riêng .local trên máy.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$binary = Join-Path $root '.local\bin\ngrok.exe'
if (-not (Test-Path -LiteralPath $binary)) { throw 'Chưa có ngrok tại .local/bin/ngrok.exe.' }
$defaultFile = Join-Path $root '.local\ngrok-domain.txt'
$defaultDomain = if (Test-Path -LiteralPath $defaultFile) { (Get-Content -LiteralPath $defaultFile -Raw).Trim() } else { '' }
$domainText = Read-Host ('Domain trong dashboard ngrok (Enter giữ ' + $defaultDomain + ')')
if (-not $domainText.Trim()) { $domainText = $defaultDomain }
if ($domainText -notmatch '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.ngrok(?:-free)?\.(?:dev|app)$') { throw 'Chỉ nhập tên domain ngrok, không nhập đường dẫn hay Authtoken.' }
$folder = Join-Path $root '.local\ngrok'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
# Chỉ sửa quyền truy cập NTFS bằng icacls, tránh đụng SACL cần SeSecurityPrivilege.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& "$env:SystemRoot\System32\icacls.exe" $folder '/inheritance:r' '/grant:r' ('*' + $identity + ':(OI)(CI)F') *> $null
if ($LASTEXITCODE -ne 0) { throw 'Không đặt được quyền riêng cho thư mục .local/ngrok; chưa nhập hay lưu khóa.' }
$rules = (Get-Acl -LiteralPath $folder).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
$unexpected = @($rules | Where-Object { $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin @($identity, 'S-1-5-18', 'S-1-5-32-544') })
if ($unexpected.Count) { throw 'Thư mục ngrok còn quyền đọc chia sẻ khác; chưa nhập hay lưu khóa.' }
$secure = Read-Host 'Dán Authtoken từ dashboard ngrok (nội dung được ẩn)' -AsSecureString
$memory = [IntPtr]::Zero
$tempFile = Join-Path $folder 'agent.pending.yml'
try {
    $memory = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($memory)
    if ($token -notmatch '^[A-Za-z0-9_-]{20,256}$') { throw 'Authtoken không đúng định dạng; chưa lưu khóa.' }
    $yaml = "version: '3'`nagent:`n  authtoken: $token`n  console_ui: false`n  web_addr: false`n"
    [IO.File]::WriteAllText($tempFile, $yaml, (New-Object Text.UTF8Encoding($false)))
    # config check chỉ đọc file trên máy, không mở tunnel hay gửi giao dịch.
    & $binary config check --config $tempFile *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Ngrok từ chối cấu hình; chưa thay thế cấu hình cũ.' }
    Move-Item -LiteralPath $tempFile -Destination (Join-Path $folder 'agent.yml') -Force
    $settings = @{ origin = 'https://' + $domainText } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $folder 'settings.json'), $settings, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Đã lưu cấu hình riêng trên máy. Không đưa thư mục .local lên Git.'
    Write-Host 'Chạy npm run start:local trước, sau đó npm run start:sepay trong terminal khác.'
} finally {
    if ($memory -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($memory) }
    $token = $null
    $yaml = $null
    if ($secure) { $secure.Dispose() }
    if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force }
}
