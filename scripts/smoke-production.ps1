[CmdletBinding()]
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [int]$TimeoutSec = 60
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl.TrimEnd("/")

function Invoke-JsonCheck {
  param([string]$Path)
  $uri = "$base$Path"
  $response = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec $TimeoutSec -Headers @{ "Cache-Control" = "no-cache" }
  if ($response.StatusCode -ne 200) { throw "$uri returned HTTP $($response.StatusCode)." }
  try { return $response.Content | ConvertFrom-Json } catch { throw "$uri did not return valid JSON." }
}

Write-Host "Checking $base/api/health ..."
$health = Invoke-JsonCheck "/api/health"
if ($health.status -ne "ok") { throw "Health status is '$($health.status)'." }
if ($health.database -ne "ok") { throw "Database health is '$($health.database)'." }
if ($health.disk.status -ne "ok") { throw "Disk health is '$($health.disk.status)'." }

Write-Host "Checking $base/api/bootstrap ..."
$bootstrap = Invoke-JsonCheck "/api/bootstrap"
if ($null -eq $bootstrap.bugs -or $null -eq $bootstrap.services -or $null -eq $bootstrap.users) {
  throw "Bootstrap response is incomplete."
}

Write-Host "Smoke test passed." -ForegroundColor Green
[PSCustomObject]@{
  BaseUrl = $base
  Health = $health.status
  Database = $health.database
  FreeDiskMB = $health.disk.freeMb
  Bugs = @($bootstrap.bugs).Count
  Services = @($bootstrap.services).Count
  Users = @($bootstrap.users).Count
}
