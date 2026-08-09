[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [string]$Root = "D:\IncidentHub",
  [string]$HealthSecret = "",
  [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")
if ([string]::IsNullOrWhiteSpace($HealthSecret)) {
  $config = Join-Path $Root "Config\Prod\.env.production"
  if (-not (Test-Path -LiteralPath $config)) { throw "Production config was not found: $config" }
  $line = Get-Content -LiteralPath $config | Where-Object { $_ -match '^\s*HEALTH_DETAILS_SECRET\s*=' } | Select-Object -Last 1
  if ($line) { $HealthSecret = (($line -split '=',2)[1]).Trim().Trim('"').Trim("'") }
}
if ([string]::IsNullOrWhiteSpace($HealthSecret)) { throw "HEALTH_DETAILS_SECRET is required for the Production smoke test." }

function Invoke-JsonCheck {
  param([string]$Path)
  $uri = "$base$Path"
  $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec $TimeoutSec -Headers @{ "Cache-Control" = "no-cache"; Authorization = "Bearer $HealthSecret" }
  if ($response.StatusCode -ne 200) { throw "$uri returned HTTP $($response.StatusCode)." }
  try { return $response.Content | ConvertFrom-Json } catch { throw "$uri did not return valid JSON." }
}

Write-Host "Checking $base/api/health ..."
$health = Invoke-JsonCheck "/api/health"
if ($health.status -ne "ok") { throw "Health status is '$($health.status)'." }
if ($health.database -ne "ok") { throw "Database health is '$($health.database)'." }
if ($health.disk.status -ne "ok") { throw "Disk health is '$($health.disk.status)'." }

Write-Host "Smoke test passed." -ForegroundColor Green
[PSCustomObject]@{
  BaseUrl = $base
  Health = $health.status
  Database = $health.database
  FreeDiskMB = $health.disk.freeMb
  Version = $health.version
}
