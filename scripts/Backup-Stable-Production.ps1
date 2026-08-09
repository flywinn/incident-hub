#requires -Version 5.1
param(
    [string]$Root = "D:\IncidentHub",
    [string]$NodePath = ""
)
$ErrorActionPreference = "Stop"
$config = Join-Path $Root "Config\Prod\.env.production"
$current = Join-Path $Root "Prod\current"
$logDir = Join-Path $Root "Logs\Prod"
$log = Join-Path $logDir "backup.log"
New-Item -ItemType Directory -Force $logDir | Out-Null
function Import-EnvFile([string]$Path) {
    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim(); if (-not $line -or $line.StartsWith("#")) { continue }
        $pos = $line.IndexOf("="); if ($pos -le 0) { continue }
        $key = $line.Substring(0,$pos).Trim(); $value = $line.Substring($pos+1).Trim().Trim('"').Trim("'")
        [Environment]::SetEnvironmentVariable($key,$value,"Process")
    }
}
if (-not (Test-Path $config)) { throw "Production config not found: $config" }
if (-not (Test-Path (Join-Path $current "backup-db.mjs"))) { throw "Stable backup script not found in current release." }
Import-EnvFile $config
if (-not $env:BACKUP_DIR) { $env:BACKUP_DIR = Join-Path $Root "Backups\Prod" }
$node = if ($NodePath) { $NodePath } else { (Get-Command node.exe -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath $node)) { throw "Node executable not found: $node" }
& $node (Join-Path $current "backup-db.mjs") *>> $log
if ($LASTEXITCODE -ne 0) { throw "Production backup failed. See $log" }
