#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Root = "D:\IncidentHub",
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [int]$ProductionPort = 3000,
    [int]$DevPort = 3001
)

$ErrorActionPreference = "Continue"
$failed = $false

function Check([string]$Name, [bool]$Ok, [string]$Detail) {
    $prefix = if ($Ok) { "[OK]" } else { "[FAIL]" }
    $color = if ($Ok) { "Green" } else { "Red" }
    Write-Host "$prefix $Name - $Detail" -ForegroundColor $color
    if (-not $Ok) { $script:failed = $true }
}
function Get-EnvValue([string]$Path, [string]$Key) {
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
function Same-Path([string]$Left, [string]$Right) {
    if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) { return $false }
    return [IO.Path]::GetFullPath($Left).TrimEnd('\') -ieq [IO.Path]::GetFullPath($Right).TrimEnd('\')
}
function Check-Health([string]$Name, [int]$Port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 10
        Check $Name ($health.status -eq "ok") "port=$Port status=$($health.status) version=$($health.version)"
    } catch {
        Check $Name $false "port=$Port $($_.Exception.Message)"
    }
}

$prodConfig = Join-Path $Root "Config\Prod\.env.production"
$devConfig = Join-Path $ProjectPath ".env.local"
$expectedDb = Join-Path $Root "Data\Prod\incident-hub.sqlite"
$expectedImages = Join-Path $Root "Data\Prod\IncidentImages"

Check "Production config" (Test-Path -LiteralPath $prodConfig) $prodConfig
Check "Dev config" (Test-Path -LiteralPath $devConfig) $devConfig

$prodDb = Get-EnvValue $prodConfig "DB_PATH"
$devDb = Get-EnvValue $devConfig "DB_PATH"
$prodImages = Get-EnvValue $prodConfig "INCIDENT_IMAGES_DIR"
$devImages = Get-EnvValue $devConfig "INCIDENT_IMAGES_DIR"
$prodMode = Get-EnvValue $prodConfig "INCIDENTHUB_DATA_MODE"
$devMode = Get-EnvValue $devConfig "INCIDENTHUB_DATA_MODE"

Check "Shared data mode" ($prodMode -eq "SHARED_PRODUCTION" -and $devMode -eq "SHARED_PRODUCTION") "Production=$prodMode Dev=$devMode"
Check "Shared database config" ((Same-Path $prodDb $expectedDb) -and (Same-Path $devDb $expectedDb)) $expectedDb
Check "Shared image config" ((Same-Path $prodImages $expectedImages) -and (Same-Path $devImages $expectedImages)) $expectedImages
Check "Shared database exists" (Test-Path -LiteralPath $expectedDb) $expectedDb
Check "Shared image directory exists" (Test-Path -LiteralPath $expectedImages) $expectedImages

Check-Health "Production health" $ProductionPort
Check-Health "Dev health" $DevPort

if ($failed) { exit 1 }
Write-Host "[OK] Dev and Production are live on one shared database and image directory." -ForegroundColor Green
