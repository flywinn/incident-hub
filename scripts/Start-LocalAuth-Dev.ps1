param(
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [int]$Port = 3001
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectPath

# Kill only the current Dev listener.
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Remove stale process-level auth values so Next.js reads the persisted .env.local values.
@(
    "AUTH_DISABLED",
    "AUTH_MODE",
    "AUTH_SESSION_SECRET",
    "AUTH_SESSION_HOURS",
    "AUTH_COOKIE_SECURE",
    "LOCAL_AUTH_BOOTSTRAP_EMAIL",
    "LOCAL_AUTH_BOOTSTRAP_PASSWORD"
) | ForEach-Object { Remove-Item ("Env:" + $_) -ErrorAction SilentlyContinue }

$env:DB_PATH = "D:\IncidentHub\Data\Dev\incident-hub-dev.sqlite"
$env:INCIDENT_IMAGES_DIR = "D:\IncidentHub\Data\Dev\IncidentImages"
$env:HOSTNAME = "0.0.0.0"
$env:PORT = [string]$Port

Write-Host "[OK] Starting IncidentHub Dev with persisted LOCAL auth config..." -ForegroundColor Green
npm run dev
