param(
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [string]$DbPath = "D:\IncidentHub\Data\Dev\incident-hub-dev.sqlite",
    [switch]$AllowProduction
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ProjectPath)) {
    throw "Project path not found: $ProjectPath"
}
if (-not (Test-Path -LiteralPath $DbPath)) {
    throw "Database not found: $DbPath"
}
if (-not $AllowProduction -and $DbPath -match '[\\/]Prod[\\/]') {
    throw "Refusing to modify a Production database without -AllowProduction."
}

$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$DbPath = (Resolve-Path -LiteralPath $DbPath).Path

Set-Location $ProjectPath
$env:DB_PATH = $DbPath

Write-Host ""
Write-Host "Current users:" -ForegroundColor Cyan
node .\scripts\reset-super-admin.mjs --list
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list users."
}

Write-Host ""
Write-Host "Choose the account that must become the ONLY Super Admin." -ForegroundColor Yellow
$TargetId = (Read-Host "User ID").Trim()
$FullName = (Read-Host "Super Admin display name").Trim()
$Username = (Read-Host "New username (English; example: superadmin)").Trim()
$Email = (Read-Host "New email").Trim()
$PasswordSecure = Read-Host "New password (minimum 8 characters)" -AsSecureString
$PasswordConfirmSecure = Read-Host "Confirm new password" -AsSecureString

function Convert-SecureToPlain {
    param([System.Security.SecureString]$Secure)

    $Bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Bstr)
    }
}

$Password = Convert-SecureToPlain -Secure $PasswordSecure
$PasswordConfirm = Convert-SecureToPlain -Secure $PasswordConfirmSecure

if ($Password -cne $PasswordConfirm) {
    throw "Password confirmation does not match."
}
if ([string]::IsNullOrWhiteSpace($Password) -or $Password.Length -lt 8) {
    throw "Password must contain at least 8 characters."
}

$env:SUPER_ADMIN_TARGET_ID = $TargetId
$env:SUPER_ADMIN_FULL_NAME = $FullName
$env:SUPER_ADMIN_USERNAME = $Username
$env:SUPER_ADMIN_EMAIL = $Email
$env:SUPER_ADMIN_PASSWORD = $Password

try {
    node .\scripts\reset-super-admin.mjs
    if ($LASTEXITCODE -ne 0) {
        throw "Super Admin reset failed."
    }
}
finally {
    Remove-Item Env:SUPER_ADMIN_TARGET_ID -ErrorAction SilentlyContinue
    Remove-Item Env:SUPER_ADMIN_FULL_NAME -ErrorAction SilentlyContinue
    Remove-Item Env:SUPER_ADMIN_USERNAME -ErrorAction SilentlyContinue
    Remove-Item Env:SUPER_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:SUPER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $Password = $null
    $PasswordConfirm = $null
}

$EnvFile = Join-Path $ProjectPath ".env.local"
$Lines = @()
if (Test-Path -LiteralPath $EnvFile) {
    $Lines = @(Get-Content -LiteralPath $EnvFile)
}

function Set-EnvValue {
    param(
        [string]$Key,
        [string]$Value
    )

    $script:Lines = @($script:Lines | Where-Object {
        $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=')
    })
    $script:Lines += "$Key=$Value"
}

function Remove-EnvValue {
    param([string]$Key)

    $script:Lines = @($script:Lines | Where-Object {
        $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=')
    })
}

Set-EnvValue -Key "AUTH_DISABLED" -Value "false"
Set-EnvValue -Key "AUTH_MODE" -Value "LOCAL"
Set-EnvValue -Key "AUTH_SESSION_HOURS" -Value "12"
Set-EnvValue -Key "AUTH_COOKIE_SECURE" -Value "false"

$Bytes = New-Object byte[] 48
$Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $Rng.GetBytes($Bytes)
}
finally {
    $Rng.Dispose()
}
Set-EnvValue -Key "AUTH_SESSION_SECRET" -Value ([Convert]::ToBase64String($Bytes))

Set-EnvValue -Key "LOCAL_AUTH_BOOTSTRAP_EMAIL" -Value $Email
Remove-EnvValue -Key "LOCAL_AUTH_BOOTSTRAP_PASSWORD"

# UTF-8 with BOM is intentional for Windows PowerShell 5.1 compatibility.
$Utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllLines($EnvFile, [string[]]$Lines, $Utf8Bom)

Write-Host ""
Write-Host "[OK] Super Admin identity and password were reset." -ForegroundColor Green
Write-Host "[OK] Exactly one SUPER_ADMIN remains; previous SUPER_ADMIN accounts were demoted to ADMIN." -ForegroundColor Green
Write-Host "[OK] .env.local now persists AUTH_MODE=LOCAL and AUTH_DISABLED=false." -ForegroundColor Green
Write-Host "[OK] Session secret was rotated; old sessions are invalid." -ForegroundColor Green
Write-Host "[OK] Bootstrap password is not stored in .env.local." -ForegroundColor Green
Write-Host ""
Write-Host "Next command:" -ForegroundColor Cyan
Write-Host "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$ProjectPath\scripts\Start-LocalAuth-Dev.ps1`""
