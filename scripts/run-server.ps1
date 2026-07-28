[CmdletBinding()]
param(
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$MaxLogSizeMB = 20,
  [int]$RetentionCount = 5
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectPath
$logDirectory = Join-Path $ProjectPath "logs"
$logPath = Join-Path $logDirectory "application.log"
New-Item -ItemType Directory -Force $logDirectory | Out-Null

function Rotate-ApplicationLog {
  if (-not (Test-Path $logPath)) { return }
  $limit = [Math]::Max(5, $MaxLogSizeMB) * 1MB
  if ((Get-Item $logPath).Length -lt $limit) { return }

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $archive = Join-Path $logDirectory "application-$stamp.log"
  Move-Item -LiteralPath $logPath -Destination $archive -Force

  Get-ChildItem $logDirectory -Filter "application-*.log" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip ([Math]::Max(2, $RetentionCount)) |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

Rotate-ApplicationLog
& npm.cmd start 2>&1 | ForEach-Object {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffK"), [string]$_
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Rotate-ApplicationLog
}
$exitCode = $LASTEXITCODE
exit $exitCode
