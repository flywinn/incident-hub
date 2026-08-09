#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Root = "D:\IncidentHub",
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [string]$DevDbPath = "D:\IncidentHub\Data\Dev\incident-hub-dev.sqlite",
    [string]$DevImagesPath = "D:\IncidentHub\Data\Dev\IncidentImages",
    [string]$ProdDbPath = "D:\IncidentHub\Data\Prod\incident-hub.sqlite",
    [int]$Port = 3000,
    [int]$DevPort = 3001,
    [switch]$SecureCookie,
    [switch]$Reconfigure
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated PowerShell window (Run as Administrator)."
    }
}
function Run-Native([string]$File, [string[]]$Args, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $File @Args
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
}
function Get-EnvValue([string[]]$Lines, [string]$Key) {
    $line = $Lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
function New-RandomSecret {
    $bytes = New-Object byte[] 48
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
function Stop-NodePort([int]$ListenPort) {
    $listeners = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -ne "node") {
            throw "Port $ListenPort is owned by non-Node process PID $($listener.OwningProcess) ($($process.ProcessName))."
        }
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Require-Admin
foreach ($path in @($DevDbPath, $ProdDbPath)) {
    if (-not [IO.Path]::IsPathRooted($path)) { throw "Database path must be absolute: $path" }
    if (-not (Test-Path -LiteralPath $path)) { throw "Database not found: $path" }
}
if ([IO.Path]::GetFullPath($DevDbPath) -ieq [IO.Path]::GetFullPath($ProdDbPath)) {
    throw "Development and Production databases must remain separate."
}
$syncScript = Join-Path $ProjectPath "scripts\sync-dev-auth-to-production.mjs"
$backupScript = Join-Path $ProjectPath "scripts\backup-db.mjs"
$migrationScript = Join-Path $ProjectPath "scripts\migrate-db.mjs"
foreach ($path in @($syncScript, $backupScript, $migrationScript)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required script not found: $path" }
}

$devConfigPath = Join-Path $ProjectPath ".env.local"
if ((Test-Path -LiteralPath $devConfigPath) -and -not $Reconfigure) {
    $existingDevLines = @(Get-Content -LiteralPath $devConfigPath)
    if ((Get-EnvValue $existingDevLines "INCIDENTHUB_DATA_MODE") -eq "SHARED_PRODUCTION") {
        throw "Shared Production data is already configured. Use -Reconfigure only when intentionally repairing its configuration."
    }
}

$confirm = Read-Host "Type PRODUCTION to back up both environments, merge Dev logins, and make Production data shared"
if ($confirm -cne "PRODUCTION") { throw "Cancelled." }
Stop-NodePort $DevPort

$prodImages = Join-Path $Root "Data\Prod\IncidentImages"
$prodBackupDir = Join-Path $Root "Backups\Prod"
$devBackupDir = Join-Path $Root "Backups\DevBeforeSharedData"
$configBackupDir = Join-Path $Root ("Backups\SharedDataConfig\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force $prodImages, $prodBackupDir, $devBackupDir, $configBackupDir | Out-Null

Set-Location $ProjectPath
$env:DB_PATH = $ProdDbPath
$env:INCIDENT_IMAGES_DIR = $prodImages
$env:BACKUP_DIR = $prodBackupDir

Write-Host "==> 1/6 Backing up Production database and incident images" -ForegroundColor Cyan
Run-Native "node.exe" @($backupScript) $ProjectPath

Write-Host "==> 2/6 Backing up the isolated Dev database and incident images" -ForegroundColor Cyan
$env:DB_PATH = $DevDbPath
$env:INCIDENT_IMAGES_DIR = $DevImagesPath
$env:BACKUP_DIR = $devBackupDir
Run-Native "node.exe" @($backupScript) $ProjectPath

Write-Host "==> 3/6 Applying numbered schema migrations to Production" -ForegroundColor Cyan
$env:DB_PATH = $ProdDbPath
$env:INCIDENT_IMAGES_DIR = $prodImages
$env:BACKUP_DIR = $prodBackupDir
Run-Native "node.exe" @($migrationScript) $ProjectPath

Write-Host "==> 4/6 Merging Dev users, roles, usernames and password hashes" -ForegroundColor Cyan
$env:DEV_DB_PATH = $DevDbPath
$env:PROD_DB_PATH = $ProdDbPath
$env:AUTH_SYNC_MODE = "MERGE"
try {
    $syncOutput = @(& node.exe $syncScript)
    if ($LASTEXITCODE -ne 0) { throw "Authentication synchronization failed with exit code $LASTEXITCODE" }
    $syncOutput | ForEach-Object { Write-Host $_ }
    $syncReport = (($syncOutput -join [Environment]::NewLine) | ConvertFrom-Json)
} finally {
    Remove-Item Env:DEV_DB_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:PROD_DB_PATH -ErrorAction SilentlyContinue
    Remove-Item Env:AUTH_SYNC_MODE -ErrorAction SilentlyContinue
}
if ($syncReport.status -ne "ok" -or [string]::IsNullOrWhiteSpace([string]$syncReport.superAdmin.email)) {
    throw "Synchronization report is incomplete."
}

Write-Host "==> 5/6 Writing Production Local Auth configuration" -ForegroundColor Cyan
$packagePath = Join-Path $ProjectPath "package.json"
$releaseVersion = [string]((Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json).version)
$configDir = Join-Path $Root "Config\Prod"
$configPath = Join-Path $configDir ".env.production"
New-Item -ItemType Directory -Force $configDir | Out-Null

$sourceProdEnv = Join-Path $ProjectPath ".env.production"
$sourceLocalEnv = Join-Path $ProjectPath ".env.local"
$lines = @()
$hasExistingProdConfig = Test-Path -LiteralPath $configPath
if ($hasExistingProdConfig) { $lines = @(Get-Content -LiteralPath $configPath) }
elseif (Test-Path -LiteralPath $sourceProdEnv) { $lines = @(Get-Content -LiteralPath $sourceProdEnv) }
elseif (Test-Path -LiteralPath $sourceLocalEnv) { $lines = @(Get-Content -LiteralPath $sourceLocalEnv) }

function Set-Env([string]$Key, [string]$Value) {
    $script:lines = @($script:lines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=') })
    $script:lines += "$Key=$Value"
}
function Remove-Env([string]$Key) {
    $script:lines = @($script:lines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=') })
}

$sessionSecret = if ($hasExistingProdConfig) { Get-EnvValue $lines "AUTH_SESSION_SECRET" } else { "" }
if ($sessionSecret.Length -lt 32) { $sessionSecret = New-RandomSecret }
$healthSecret = if ($hasExistingProdConfig) { Get-EnvValue $lines "HEALTH_DETAILS_SECRET" } else { "" }
if ($healthSecret.Length -lt 32) { $healthSecret = New-RandomSecret }

Set-Env "DB_PATH" $ProdDbPath
Set-Env "INCIDENT_IMAGES_DIR" $prodImages
Set-Env "HOSTNAME" "0.0.0.0"
Set-Env "PORT" ([string]$Port)
Set-Env "AUTH_DISABLED" "false"
Set-Env "AUTH_MODE" "LOCAL"
Set-Env "AUTH_SESSION_SECRET" $sessionSecret
Set-Env "AUTH_SESSION_HOURS" "12"
Set-Env "AUTH_COOKIE_SECURE" $(if ($SecureCookie) { "true" } else { "false" })
Set-Env "AUTH_TRUST_PROXY_HEADERS" "false"
Set-Env "AUTH_LOGIN_MAX_FAILURES" "5"
Set-Env "AUTH_LOGIN_SOURCE_MAX_FAILURES" "50"
Set-Env "AUTH_LOGIN_WINDOW_SECONDS" "900"
Set-Env "AUTH_LOGIN_LOCK_SECONDS" "900"
Set-Env "HEALTH_DETAILS_SECRET" $healthSecret
Set-Env "LOCAL_AUTH_BOOTSTRAP_EMAIL" ([string]$syncReport.superAdmin.email)
Remove-Env "LOCAL_AUTH_BOOTSTRAP_PASSWORD"
Set-Env "SEED_DEMO_DATA" "false"
Set-Env "IMPORT_BUNDLED_REPORT" "false"
Set-Env "APP_VERSION" $releaseVersion
Set-Env "INCIDENTHUB_DATA_MODE" "SHARED_PRODUCTION"
Set-Env "SQLITE_BUSY_TIMEOUT_MS" "30000"
Set-Env "MIN_FREE_DISK_MB" "1024"
Set-Env "STARTUP_MIN_FREE_DISK_MB" "512"
Set-Env "BACKUP_DIR" $prodBackupDir
Set-Env "BACKUP_RETENTION_COUNT" "14"

$utf8 = New-Object Text.UTF8Encoding($true)
if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination (Join-Path $configBackupDir ".env.production") -Force
}
[IO.File]::WriteAllLines($configPath, [string[]]$lines, $utf8)

Write-Host "==> 6/6 Pointing Dev at the same Production database and incident-image directory" -ForegroundColor Cyan
$devLines = if (Test-Path -LiteralPath $devConfigPath) { @(Get-Content -LiteralPath $devConfigPath) } else { @() }
if (Test-Path -LiteralPath $devConfigPath) {
    Copy-Item -LiteralPath $devConfigPath -Destination (Join-Path $configBackupDir ".env.local") -Force
}
function Set-DevEnv([string]$Key, [string]$Value) {
    $script:devLines = @($script:devLines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=') })
    $script:devLines += "$Key=$Value"
}
function Remove-DevEnv([string]$Key) {
    $script:devLines = @($script:devLines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=') })
}

$devSessionSecret = Get-EnvValue $devLines "AUTH_SESSION_SECRET"
if ($devSessionSecret.Length -lt 32) { $devSessionSecret = New-RandomSecret }
$devHealthSecret = Get-EnvValue $devLines "HEALTH_DETAILS_SECRET"
if ($devHealthSecret.Length -lt 32) { $devHealthSecret = New-RandomSecret }

Set-DevEnv "DB_PATH" $ProdDbPath
Set-DevEnv "INCIDENT_IMAGES_DIR" $prodImages
Set-DevEnv "HOSTNAME" "0.0.0.0"
Set-DevEnv "PORT" ([string]$DevPort)
Set-DevEnv "AUTH_DISABLED" "false"
Set-DevEnv "AUTH_MODE" "LOCAL"
Set-DevEnv "AUTH_SESSION_SECRET" $devSessionSecret
Set-DevEnv "AUTH_SESSION_HOURS" "12"
Set-DevEnv "AUTH_COOKIE_SECURE" "false"
Set-DevEnv "AUTH_TRUST_PROXY_HEADERS" "false"
Set-DevEnv "HEALTH_DETAILS_SECRET" $devHealthSecret
Set-DevEnv "LOCAL_AUTH_BOOTSTRAP_EMAIL" ([string]$syncReport.superAdmin.email)
Remove-DevEnv "LOCAL_AUTH_BOOTSTRAP_PASSWORD"
Set-DevEnv "SEED_DEMO_DATA" "false"
Set-DevEnv "IMPORT_BUNDLED_REPORT" "false"
Set-DevEnv "INCIDENTHUB_DATA_MODE" "SHARED_PRODUCTION"
Set-DevEnv "SQLITE_BUSY_TIMEOUT_MS" "30000"
[IO.File]::WriteAllLines($devConfigPath, [string[]]$devLines, $utf8)

Write-Host "[OK] Dev login accounts were merged into Production; existing Production users were preserved." -ForegroundColor Green
Write-Host "[OK] Production incidents, settings, assignments and images were preserved." -ForegroundColor Green
Write-Host "[OK] Dev and Production now use the same database: $ProdDbPath" -ForegroundColor Green
Write-Host "[OK] Dev and Production now use the same images: $prodImages" -ForegroundColor Green
Write-Host "[OK] Production config: $configPath" -ForegroundColor Green
Write-Host "[OK] Dev config: $devConfigPath" -ForegroundColor Green
Write-Host "[OK] Previous configs: $configBackupDir" -ForegroundColor Green
Write-Host "[OK] Isolated Dev database was backed up and left in place; it is no longer active." -ForegroundColor Green
Write-Host "[OK] Plain-text passwords and password hashes were not printed or stored in config." -ForegroundColor Green
if (-not $SecureCookie) {
    Write-Host "[WARN] AUTH_COOKIE_SECURE=false. Use -SecureCookie when users access IncidentHub through HTTPS." -ForegroundColor Yellow
}
Write-Host "[NEXT] Install Stable Production, then start Dev with scripts\Start-LocalAuth-Dev.ps1." -ForegroundColor Cyan
