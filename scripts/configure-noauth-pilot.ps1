[CmdletBinding()]
param(
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$Port = 3000,
  [string]$AllowedRemoteAddress = "172.25.3.0/24",
  [string]$AdminEmail = "monitoring-admin@af.hadc.me",
  [string]$AdminName = "Monitoring Administrator",
  [string]$DatabasePath = "D:\IncidentHub\Data\Prod\incident-hub.sqlite"
)

$ErrorActionPreference = "Stop"
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "PowerShell must be opened with Run as Administrator."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed or is not in PATH." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm is not installed or is not in PATH." }

function New-RandomHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $rng.Dispose()
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

$dbDirectory = Split-Path -Parent $DatabasePath
New-Item -ItemType Directory -Force $dbDirectory | Out-Null
New-Item -ItemType Directory -Force (Join-Path $ProjectPath "logs") | Out-Null

$elkSecret = New-RandomHex 32
$envFile = Join-Path $ProjectPath ".env.production"
$content = @"
DB_PATH=$DatabasePath
HOSTNAME=0.0.0.0
PORT=$Port
AUTH_DISABLED=true
NOAUTH_ADMIN_EMAIL=$AdminEmail
NOAUTH_ADMIN_NAME=$AdminName
DASHBOARD_OWNER_EMAILS=$AdminEmail
AUTH_USER_HEADER=x-authenticated-user
AUTH_NAME_HEADER=x-authenticated-name
AUTH_EMAIL_DOMAIN=af.hadc.me
AUTH_PROXY_SECRET=
ELK_WEBHOOK_SECRET=$elkSecret
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_SECRET=
SEED_DEMO_DATA=false
IMPORT_BUNDLED_REPORT=false
LOAD_DEFAULT_SERVICE_CATALOG=true
"@
Set-Content -Path $envFile -Value $content -Encoding utf8

$ruleName = "ELK Incident Hub Pilot TCP $Port"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress $AllowedRemoteAddress `
  -Profile Domain,Private | Out-Null

Write-Host "Configuration created: $envFile"
Write-Host "Firewall permits TCP/$Port only from: $AllowedRemoteAddress"
Write-Host "ELK webhook secret (store securely): $elkSecret"
Write-Host "Next commands:"
Write-Host "  Set-Location `"$ProjectPath`""
Write-Host "  npm install"
Write-Host "  npm run lint"
Write-Host "  npm run build"
Write-Host "  npm start"



