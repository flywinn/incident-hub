#requires -Version 5.1
param(
    [string]$Root = "D:\IncidentHub",
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [string]$DbPath = "D:\IncidentHub\Data\Prod\incident-hub.sqlite",
    [int]$Port = 3000
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if (-not (Test-Path -LiteralPath $DbPath)) { throw "Production database not found: $DbPath" }
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath "scripts\reset-super-admin.mjs"))) { throw "reset-super-admin.mjs not found in project." }
$confirm = Read-Host "Type PRODUCTION to configure Local Auth on the production database"
if ($confirm -cne "PRODUCTION") { throw "Cancelled." }
Set-Location $ProjectPath
$env:DB_PATH = $DbPath
Write-Host "Current production users:" -ForegroundColor Cyan
node .\scripts\reset-super-admin.mjs --list
if ($LASTEXITCODE -ne 0) { throw "Unable to list production users." }
$targetId = (Read-Host "User ID for the ONLY Super Admin").Trim()
$fullName = (Read-Host "Super Admin display name").Trim()
$username = (Read-Host "Super Admin username").Trim()
$email = (Read-Host "Super Admin email").Trim()
$p1 = Read-Host "New Super Admin password" -AsSecureString
$p2 = Read-Host "Confirm password" -AsSecureString
function Plain([Security.SecureString]$Secure) {
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}
$password = Plain $p1; $password2 = Plain $p2
if ($password -cne $password2) { throw "Password confirmation does not match." }
if ([string]::IsNullOrWhiteSpace($password) -or $password.Length -lt 8) { throw "Password must be at least 8 characters." }
$env:SUPER_ADMIN_TARGET_ID = $targetId
$env:SUPER_ADMIN_FULL_NAME = $fullName
$env:SUPER_ADMIN_USERNAME = $username
$env:SUPER_ADMIN_EMAIL = $email
$env:SUPER_ADMIN_PASSWORD = $password
try {
    node .\scripts\reset-super-admin.mjs
    if ($LASTEXITCODE -ne 0) { throw "Super Admin reset failed." }
} finally {
    "SUPER_ADMIN_TARGET_ID","SUPER_ADMIN_FULL_NAME","SUPER_ADMIN_USERNAME","SUPER_ADMIN_EMAIL","SUPER_ADMIN_PASSWORD" | ForEach-Object { Remove-Item ("Env:"+$_) -ErrorAction SilentlyContinue }
    $password=$null; $password2=$null
}

$configDir = Join-Path $Root "Config\Prod"
$configPath = Join-Path $configDir ".env.production"
New-Item -ItemType Directory -Force $configDir | Out-Null
$sourceProdEnv = Join-Path $ProjectPath ".env.production"
$sourceLocalEnv = Join-Path $ProjectPath ".env.local"
$lines = @()
if (Test-Path $configPath) { $lines = @(Get-Content -LiteralPath $configPath) }
elseif (Test-Path $sourceProdEnv) { $lines = @(Get-Content -LiteralPath $sourceProdEnv) }
elseif (Test-Path $sourceLocalEnv) { $lines = @(Get-Content -LiteralPath $sourceLocalEnv) }
function Set-Env([string]$Key,[string]$Value) {
    $script:lines = @($script:lines | Where-Object { $_ -notmatch ('^\s*'+[regex]::Escape($Key)+'\s*=') })
    $script:lines += "$Key=$Value"
}
function Remove-Env([string]$Key) { $script:lines = @($script:lines | Where-Object { $_ -notmatch ('^\s*'+[regex]::Escape($Key)+'\s*=') }) }
$bytes = New-Object byte[] 48; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
Set-Env "DB_PATH" $DbPath
Set-Env "INCIDENT_IMAGES_DIR" (Join-Path $Root "Data\Prod\IncidentImages")
Set-Env "HOSTNAME" "0.0.0.0"
Set-Env "PORT" ([string]$Port)
Set-Env "AUTH_DISABLED" "false"
Set-Env "AUTH_MODE" "LOCAL"
Set-Env "AUTH_SESSION_SECRET" ([Convert]::ToBase64String($bytes))
Set-Env "AUTH_SESSION_HOURS" "12"
Set-Env "AUTH_COOKIE_SECURE" "false"
Set-Env "LOCAL_AUTH_BOOTSTRAP_EMAIL" $email
Remove-Env "LOCAL_AUTH_BOOTSTRAP_PASSWORD"
Set-Env "SEED_DEMO_DATA" "false"
Set-Env "IMPORT_BUNDLED_REPORT" "false"
Set-Env "APP_VERSION" "1.13.0-stable-dark"
Set-Env "SQLITE_BUSY_TIMEOUT_MS" "10000"
Set-Env "MIN_FREE_DISK_MB" "1024"
Set-Env "STARTUP_MIN_FREE_DISK_MB" "512"
Set-Env "BACKUP_DIR" (Join-Path $Root "Backups\Prod")
Set-Env "BACKUP_RETENTION_COUNT" "14"
$utf8 = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllLines($configPath,[string[]]$lines,$utf8)
New-Item -ItemType Directory -Force (Join-Path $Root "Data\Prod\IncidentImages"),(Join-Path $Root "Backups\Prod") | Out-Null
Write-Host "[OK] Production Local Auth configured." -ForegroundColor Green
Write-Host "[OK] Production config: $configPath" -ForegroundColor Green
Write-Host "[OK] Plain-text password was not stored." -ForegroundColor Green
