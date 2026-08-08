#requires -Version 5.1
param(
    [string]$Root = "D:\IncidentHub",
    [string]$TaskName = "ELK Incident Hub",
    [int]$Port = 3000
)
$ErrorActionPreference = "Continue"
$failed = $false
function Check([string]$Name,[bool]$Ok,[string]$Detail) {
    if ($Ok) { $prefix = "[OK]"; $color = "Green" } else { $prefix = "[FAIL]"; $color = "Red" }
    Write-Host ($prefix + " " + $Name + " - " + $Detail) -ForegroundColor $color
    if(-not $Ok){$script:failed=$true}
}
$current = Join-Path $Root "Prod\current"
$config = Join-Path $Root "Config\Prod\.env.production"
Check "Current release" (Test-Path $current) $current
Check "Production config" (Test-Path $config) $config
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Check "Scheduled task" ([bool]$task) $TaskName
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { $listenerDetail = "PID $($listener.OwningProcess)" } else { $listenerDetail = "port $Port not listening" }
Check "TCP listener" ([bool]$listener) $listenerDetail
try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
    Check "Health endpoint" ($health.status -eq "ok") ("status="+$health.status+" version="+$health.version)
} catch { Check "Health endpoint" $false $_.Exception.Message }
if ($failed) { exit 1 }
Write-Host "[OK] Stable production validation passed." -ForegroundColor Green
