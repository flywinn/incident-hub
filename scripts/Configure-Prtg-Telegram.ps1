#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Root = "D:\IncidentHub",
    [string]$TaskName = "ELK Incident Hub"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell window (Run as Administrator)."
}

$configPath = Join-Path $Root "Config\Prod\.env.production"
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Production configuration was not found: $configPath"
}

$lines = @(Get-Content -LiteralPath $configPath)
function Get-EnvValue([string]$Key) {
    $line = $script:lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}
function Set-EnvValue([string]$Key, [string]$Value) {
    $script:lines = @($script:lines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($Key) + '\s*=') })
    $script:lines += "$Key=$Value"
}
function Convert-SecureToPlain([Security.SecureString]$Secure) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function New-RandomSecret {
    $bytes = New-Object byte[] 36
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$botTokenSecure = Read-Host "Telegram Bot Token" -AsSecureString
$botToken = Convert-SecureToPlain $botTokenSecure
$chatId = (Read-Host "Telegram Chat ID (example: -100123456789)").Trim()
if ([string]::IsNullOrWhiteSpace($botToken) -or [string]::IsNullOrWhiteSpace($chatId)) {
    throw "Telegram Bot Token and Chat ID are required."
}

$webhookSecret = Get-EnvValue "PRTG_WEBHOOK_SECRET"
if ($webhookSecret.Length -lt 24) { $webhookSecret = New-RandomSecret }
Set-EnvValue "TELEGRAM_BOT_TOKEN" $botToken
Set-EnvValue "TELEGRAM_CHAT_ID" $chatId
Set-EnvValue "PRTG_WEBHOOK_SECRET" $webhookSecret

$utf8 = New-Object Text.UTF8Encoding($true)
[IO.File]::WriteAllLines($configPath, [string[]]$lines, $utf8)
$botToken = $null

Restart-ScheduledTask -TaskName $TaskName -ErrorAction Stop
Write-Host "[OK] PRTG and Telegram configuration saved." -ForegroundColor Green
Write-Host "PRTG webhook path:" -ForegroundColor Cyan
Write-Host "/api/integrations/prtg?secret=$webhookSecret&template=grouped-standard"

$network = Test-NetConnection api.telegram.org -Port 443 -WarningAction SilentlyContinue
if ($network.TcpTestSucceeded) {
    Write-Host "[OK] api.telegram.org:443 is reachable." -ForegroundColor Green
} else {
    Write-Host "[WARN] api.telegram.org:443 is blocked; formatting works, but Telegram delivery will fail until the network allows it." -ForegroundColor Yellow
}
