#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Root = "D:\IncidentHub",
    [string]$ProjectPath = "D:\IncidentHub\Dev",
    [string]$Branch = "feature/noc-workflow-v1.15",
    [int]$ProdPort = 3000,
    [int]$DevPort = 3001,
    [string]$TaskName = "ELK Incident Hub"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Section([string]$Title) {
    Write-Host ""
    Write-Host ("==== {0} ====" -f $Title) -ForegroundColor Cyan
}

function Get-EnvValue([string]$Path,[string]$Key) {
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match ('^\s*'+[regex]::Escape($Key)+'\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=',2)[1]).Trim().Trim('"').Trim("'")
}

function Get-OptionalProperty($Object,[string]$Name,[string]$Fallback="") {
    if ($null -eq $Object) { return $Fallback }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return $Fallback }
    return [string]$property.Value
}

function Get-PortSnapshot([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
        return [pscustomobject]@{ Port=$Port; Listening=$false; PID=$null; Process=""; CommandLine="" }
    }
    $pidValue = [int]$listener.OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    return [pscustomobject]@{
        Port = $Port
        Listening = $true
        PID = $pidValue
        Process = if($process){$process.Name}else{""}
        CommandLine = if($process){$process.CommandLine}else{""}
    }
}

function Get-Health([int]$Port,[string]$Secret) {
    $uri = "http://127.0.0.1:$Port/api/health"
    try {
        if ($Secret) {
            return Invoke-RestMethod -Uri $uri -Headers @{Authorization="Bearer $Secret"} -TimeoutSec 5
        }
        return Invoke-RestMethod -Uri $uri -TimeoutSec 5
    } catch {
        return [pscustomobject]@{ status="unreachable"; error=$_.Exception.Message }
    }
}

Section "Safety"
Write-Host "READ-ONLY preflight. This script does not stop, restart, build, migrate, or edit anything." -ForegroundColor Green

Section "Local Git"
if (-not (Test-Path -LiteralPath (Join-Path $ProjectPath ".git"))) {
    throw "Git working tree not found: $ProjectPath"
}
Push-Location $ProjectPath
try {
    $localBranch = (& git branch --show-current).Trim()
    $localHead = (& git rev-parse HEAD).Trim()
    $status = @(& git status --porcelain)
    Write-Host "Branch       : $localBranch"
    Write-Host "HEAD         : $localHead"
    Write-Host "Working tree : $(if($status.Count){'DIRTY'}else{'CLEAN'})"
    if ($status.Count) { $status | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow } }

    try {
        $remoteLine = (& git ls-remote origin ("refs/heads/" + $Branch) 2>$null | Select-Object -First 1)
        $remoteHead = if($remoteLine){($remoteLine -split '\s+')[0]}else{""}
        Write-Host "Remote $Branch : $remoteHead"
        Write-Host "Source sync   : $(if($remoteHead -and $remoteHead -eq $localHead){'MATCH'}elseif($remoteHead){'DIFFERENT'}else{'UNKNOWN'})"
    } catch {
        Write-Host "Remote check  : unavailable ($($_.Exception.Message))" -ForegroundColor Yellow
    }
} finally { Pop-Location }

Section "Configuration"
$devConfig = Join-Path $ProjectPath ".env.local"
$prodConfig = Join-Path $Root "Config\Prod\.env.production"
$devMode = Get-EnvValue $devConfig "INCIDENTHUB_DATA_MODE"
$devDb = Get-EnvValue $devConfig "DB_PATH"
$prodDb = Get-EnvValue $prodConfig "DB_PATH"
$devImages = Get-EnvValue $devConfig "INCIDENT_IMAGES_DIR"
$prodImages = Get-EnvValue $prodConfig "INCIDENT_IMAGES_DIR"
$prodSecret = Get-EnvValue $prodConfig "HEALTH_DETAILS_SECRET"
$devSecret = Get-EnvValue $devConfig "HEALTH_DETAILS_SECRET"
Write-Host "Dev data mode : $devMode"
Write-Host "Dev DB        : $devDb"
Write-Host "Prod DB       : $prodDb"
Write-Host "DB sync       : $(if($devDb -and $prodDb -and $devDb -eq $prodDb){'SHARED'}else{'DIFFERENT/UNKNOWN'})"
Write-Host "Dev Images    : $devImages"
Write-Host "Prod Images   : $prodImages"
Write-Host "Image sync    : $(if($devImages -and $prodImages -and $devImages -eq $prodImages){'SHARED'}else{'DIFFERENT/UNKNOWN'})"

Section "Runtime"
$prodRuntime = Get-PortSnapshot $ProdPort
$devRuntime = Get-PortSnapshot $DevPort
$prodRuntime | Format-List
$devRuntime | Format-List

Section "Scheduled Task"
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "Task state: $($task.State)"
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($taskInfo) {
        $resultValue = [uint32]$taskInfo.LastTaskResult
        Write-Host "Last run : $($taskInfo.LastRunTime)"
        Write-Host ("Result   : {0} (0x{1:X8})" -f $taskInfo.LastTaskResult,$resultValue)
        Write-Host "Next run : $($taskInfo.NextRunTime)"
    }
    ($task.Actions | Select-Object Execute,Arguments,WorkingDirectory) | Format-List
} else {
    Write-Host "Scheduled Task not found." -ForegroundColor Yellow
}

Section "Stable Junction"
$current = Join-Path $Root "Prod\current"
if (Test-Path -LiteralPath $current) {
    $item = Get-Item -LiteralPath $current -Force
    Write-Host "Current path : $current"
    Write-Host "Attributes   : $($item.Attributes)"
    try { Write-Host "Target       : $($item.Target)" } catch { }
} else {
    Write-Host "Stable current path not found: $current" -ForegroundColor Yellow
}

Section "Health"
$prodHealth = Get-Health $ProdPort $prodSecret
$devHealth = Get-Health $DevPort $devSecret
Write-Host "Production health:"
$prodHealth | Format-List
Write-Host "Development health:"
$devHealth | Format-List

Section "Verdict"
$localHeadForVerdict = ""
Push-Location $ProjectPath
try { $localHeadForVerdict = (& git rev-parse HEAD).Trim() } finally { Pop-Location }
$prodStatus = Get-OptionalProperty $prodHealth "status" "unknown"
$devStatus = Get-OptionalProperty $devHealth "status" "unknown"
$prodVersion = Get-OptionalProperty $prodHealth "version" "unavailable"
$devVersion = Get-OptionalProperty $devHealth "version" "unavailable"
$prodCommit = Get-OptionalProperty $prodHealth "commit" "unavailable"
$devCommit = Get-OptionalProperty $devHealth "commit" "unavailable"
Write-Host "Expected source branch   : $Branch"
Write-Host "Local source commit      : $localHeadForVerdict"
Write-Host "Production health        : $prodStatus"
Write-Host "Production code version  : $prodVersion"
Write-Host "Production release commit: $prodCommit"
Write-Host "Development health       : $devStatus"
Write-Host "Development code version : $devVersion"
Write-Host "Development release commit: $devCommit"
if (-not $prodRuntime.Listening) {
    Write-Host "[WARN] Production port $ProdPort is not listening." -ForegroundColor Yellow
}
if ($status.Count) {
    Write-Host "[WARN] Working tree is dirty; preserve or review local changes before switching branches." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "No changes were made." -ForegroundColor Green
