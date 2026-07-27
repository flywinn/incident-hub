[CmdletBinding()]
param(
  [string]$Server = "172.25.3.8",
  [int]$Port = 3000
)
$ErrorActionPreference = "Stop"
Write-Host "TCP test:"
Test-NetConnection -ComputerName $Server -Port $Port
Write-Host "Health test:"
Invoke-RestMethod -Uri "http://${Server}:${Port}/api/health"
