param(
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectPath

$configPath = Join-Path $ProjectPath ".env.local"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Dev config was not found: $configPath"
}
function Get-EnvValue([string[]]$Lines, [string]$Key) {
    $line = $Lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

$lines = @(Get-Content -LiteralPath $configPath)
$dataMode = Get-EnvValue $lines "INCIDENTHUB_DATA_MODE"
$dbPath = Get-EnvValue $lines "DB_PATH"
$imagesPath = Get-EnvValue $lines "INCIDENT_IMAGES_DIR"
if ($dataMode -ne "SHARED_PRODUCTION") {
    throw "Dev is not configured for shared Production data. Run Configure-Production-Like-Dev.ps1 first."
}
if (-not [IO.Path]::IsPathRooted($dbPath) -or $dbPath -notmatch '[\\/]Data[\\/]Prod[\\/]') {
    throw "Shared DB_PATH is invalid: $dbPath"
}
if (-not (Test-Path -LiteralPath $dbPath)) { throw "Shared database was not found: $dbPath" }
if (-not [IO.Path]::IsPathRooted($imagesPath) -or $imagesPath -notmatch '[\\/]Data[\\/]Prod[\\/]') {
    throw "Shared INCIDENT_IMAGES_DIR is invalid: $imagesPath"
}
if (-not (Test-Path -LiteralPath $imagesPath)) { throw "Shared incident-image directory was not found: $imagesPath" }

# Kill only a Node process already listening on the Dev port.
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -ne "node") {
        throw "Port $Port is owned by non-Node process PID $($_.OwningProcess) ($($process.ProcessName))."
    }
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Remove stale process-level auth values so Next.js reads the persisted .env.local values.
@(
    "AUTH_DISABLED",
    "AUTH_MODE",
    "AUTH_SESSION_SECRET",
    "AUTH_SESSION_HOURS",
    "AUTH_COOKIE_SECURE",
    "LOCAL_AUTH_BOOTSTRAP_EMAIL",
    "LOCAL_AUTH_BOOTSTRAP_PASSWORD",
    "DB_PATH",
    "INCIDENT_IMAGES_DIR"
) | ForEach-Object { Remove-Item ("Env:" + $_) -ErrorAction SilentlyContinue }

$env:DB_PATH = $dbPath
$env:INCIDENT_IMAGES_DIR = $imagesPath
$env:HOSTNAME = "0.0.0.0"
$env:PORT = [string]$Port

Write-Host "[OK] Starting IncidentHub Dev on shared Production data." -ForegroundColor Green
Write-Host "[OK] Database: $dbPath" -ForegroundColor Green
Write-Host "[OK] Incident images: $imagesPath" -ForegroundColor Green
npm run dev
