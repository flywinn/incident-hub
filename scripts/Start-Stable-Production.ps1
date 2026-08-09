#requires -Version 5.1
param(
    [string]$Root = "D:\IncidentHub",
    [int]$Port = 3000,
    [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$current = Join-Path $Root "Prod\current"
$config = Join-Path $Root "Config\Prod\.env.production"
$logDir = Join-Path $Root "Logs\Prod"
$logFile = Join-Path $logDir "application.log"
New-Item -ItemType Directory -Force $logDir | Out-Null

if (Test-Path -LiteralPath $logFile) {
    $logItem = Get-Item -LiteralPath $logFile
    if ($logItem.Length -ge 50MB) {
        $archive = Join-Path $logDir ("application-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
        Move-Item -LiteralPath $logFile -Destination $archive -Force
        Get-ChildItem -LiteralPath $logDir -Filter "application-*.log" -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip 10 | Remove-Item -Force -ErrorAction SilentlyContinue
    }
}

function Write-Log([string]$Level, [string]$Message) {
    Add-Content -LiteralPath $logFile -Value ("{0} [{1}] {2}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffK"), $Level.ToUpperInvariant(), $Message) -Encoding UTF8
}

function Import-EnvFile([string]$Path) {
    foreach ($raw in Get-Content -LiteralPath $Path) {
        $line = $raw.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $pos = $line.IndexOf("=")
        if ($pos -le 0) { continue }
        $key = $line.Substring(0, $pos).Trim()
        $value = $line.Substring($pos + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

try {
    if (-not (Test-Path -LiteralPath $current)) { throw "Stable current release was not found: $current" }
    if (-not (Test-Path -LiteralPath $config)) { throw "Production environment file was not found: $config" }
    if (-not (Test-Path -LiteralPath (Join-Path $current "server.js"))) { throw "Standalone server.js was not found in current release." }

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        Write-Log "warn" "Port $Port is already listening on PID $($listener.OwningProcess); startup skipped."
        exit 0
    }

    Import-EnvFile $config
    $env:NODE_ENV = "production"
    $env:HOSTNAME = "0.0.0.0"
    $env:PORT = [string]$Port

    $node = if ($NodePath) { $NodePath } else { (Get-Command node.exe -ErrorAction Stop).Source }
    if (-not (Test-Path -LiteralPath $node)) { throw "Node executable not found: $node" }
    Set-Location -LiteralPath $current
    Write-Log "info" "Starting IncidentHub stable runtime. Release=$current Port=$Port Node=$node"
    & $node (Join-Path $current "server.js") *>> $logFile
    $exitCode = $LASTEXITCODE
    Write-Log "warn" "Node exited with code $exitCode"
    exit $exitCode
}
catch {
    Write-Log "fatal" $_.Exception.ToString()
    exit 1
}
