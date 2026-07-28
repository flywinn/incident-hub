[CmdletBinding()]
param(
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectPath
$envFile = Join-Path $ProjectPath ".env.production"
if (-not (Test-Path $envFile)) { throw "Production environment file not found: $envFile" }

Get-Content -LiteralPath $envFile -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $separator = $line.IndexOf("=")
  if ($separator -le 0) { return }
  $key = $line.Substring(0, $separator).Trim()
  $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
  [Environment]::SetEnvironmentVariable($key, $value, "Process")
}

& node.exe scripts\backup-db.mjs
if ($LASTEXITCODE -ne 0) { throw "Database backup failed with exit code $LASTEXITCODE." }
