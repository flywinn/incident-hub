#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Root = "D:\IncidentHub",
    [string]$SourcePath = "D:\IncidentHub\Dev",
    [string]$TaskName = "ELK Incident Hub",
    [string]$BackupTaskName = "ELK Incident Hub Backup",
    [int]$Port = 3000,
    [int]$KeepReleases = 5,
    [switch]$SkipLint,
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from an elevated PowerShell window (Run as Administrator)."
    }
}
function Run-Native([string]$File,[string[]]$Arguments,[string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
}
function Get-EnvValue([string]$Path,[string]$Key) {
    $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match ('^\s*'+[regex]::Escape($Key)+'\s*=') } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=',2)[1]).Trim().Trim('"').Trim("'")
}
function Remove-JunctionOrDirectory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        cmd.exe /c "rmdir `"$Path`"" | Out-Null
    } else {
        throw "Refusing to remove non-junction path: $Path"
    }
}
function Get-JunctionTarget([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $item = Get-Item -LiteralPath $Path -Force
    if (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { return $null }
    try { return $item.Target } catch { return $null }
}
function Set-Junction([string]$Path,[string]$Target) {
    Remove-JunctionOrDirectory $Path
    $parent = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force $parent | Out-Null
    cmd.exe /c "mklink /J `"$Path`" `"$Target`"" | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Path)) { throw "Failed to create junction: $Path -> $Target" }
}
function Stop-Port([int]$ListenPort) {
    $connections = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)
    foreach ($c in $connections) {
        $processId = [int]$c.OwningProcess
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if ($proc -and $proc.Name -notmatch '^node(\.exe)?$') {
            throw "Port $ListenPort is owned by non-Node process PID $processId ($($proc.Name)). Refusing to stop it."
        }
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}
function Wait-PortFree([int]$ListenPort,[int]$Seconds=30) {
    for($i=0;$i -lt $Seconds;$i++){
        if(-not (Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue)){return $true}
        Start-Sleep -Seconds 1
    }
    return $false
}
function Wait-Health([int]$ListenPort,[string]$Secret,[int]$Seconds=120) {
    $last = ""
    $headers = @{ Authorization = "Bearer $Secret" }
    for($i=0;$i -lt $Seconds;$i++){
        try {
            $h = Invoke-RestMethod -Uri "http://127.0.0.1:$ListenPort/api/health" -Headers $headers -TimeoutSec 4
            if($h.status -eq "ok"){ return $h }
            $last = "status=$($h.status)"
        } catch { $last = $_.Exception.Message }
        Start-Sleep -Seconds 1
    }
    throw "Health check did not become ready: $last"
}
function Register-Tasks([string]$ToolsPath,[string]$NodeExe) {
    $start = Join-Path $ToolsPath "Start-Stable-Production.ps1"
    $backup = Join-Path $ToolsPath "Backup-Stable-Production.ps1"
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
    $action = New-ScheduledTaskAction -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$start`" -Root `"$Root`" -Port $Port -NodePath `"$NodeExe`"" -WorkingDirectory $ToolsPath
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

    $backupSettings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 2) -StartWhenAvailable -MultipleInstances IgnoreNew
    $backupAction = New-ScheduledTaskAction -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$backup`" -Root `"$Root`" -NodePath `"$NodeExe`"" -WorkingDirectory $ToolsPath
    $backupTrigger = New-ScheduledTaskTrigger -Daily -At 2:30am
    Register-ScheduledTask -TaskName $BackupTaskName -Action $backupAction -Trigger $backupTrigger -Principal $principal -Settings $backupSettings -Force | Out-Null
}

Require-Admin
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$sourcePackagePath = Join-Path $SourcePath "package.json"
if (-not (Test-Path -LiteralPath $sourcePackagePath)) { throw "Source project not found: $SourcePath" }
$releaseVersion = [string]((Get-Content -LiteralPath $sourcePackagePath -Raw | ConvertFrom-Json).version)
if ($releaseVersion -notmatch '^\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$') { throw "Invalid package version: $releaseVersion" }
$sourceCommit = ""
if (Test-Path -LiteralPath (Join-Path $SourcePath ".git")) {
    try {
        $sourceCommit = ((& git.exe -C $SourcePath rev-parse HEAD 2>$null) | Select-Object -First 1).Trim()
        if ($LASTEXITCODE -ne 0) { $sourceCommit = "" }
    } catch { $sourceCommit = "" }
}

$configPath = Join-Path $Root "Config\Prod\.env.production"
$prodDb = Join-Path $Root "Data\Prod\incident-hub.sqlite"
$prodImages = Join-Path $Root "Data\Prod\IncidentImages"
$buildRoot = Join-Path $Root "Build\Stable"
$releasesRoot = Join-Path $Root "Releases"
$currentPath = Join-Path $Root "Prod\current"
$previousPath = Join-Path $Root "Prod\previous"
$toolsPath = Join-Path $Root "Tools"
$backupRoot = Join-Path $Root "Backups\StableDeploy"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$buildPath = Join-Path $buildRoot $stamp
$releasePath = Join-Path $releasesRoot ("v" + $releaseVersion + "-" + $stamp)
$deployBackup = Join-Path $backupRoot $stamp
$oldTaskXml = Join-Path $deployBackup "old-task.xml"
$oldCurrentTarget = Get-JunctionTarget $currentPath
$hadOldTask = $false
$cutover = $false

New-Item -ItemType Directory -Force $buildPath,$releasesRoot,$toolsPath,$deployBackup,$prodImages | Out-Null

if (-not (Test-Path -LiteralPath (Join-Path $SourcePath "node_modules"))) { throw "Source node_modules is missing. Run npm install in $SourcePath first." }
if (-not (Test-Path -LiteralPath $configPath)) { throw "Production config is missing. Run Configure-Production-Auth.ps1 first: $configPath" }
if (-not (Test-Path -LiteralPath $prodDb)) { throw "Production database is missing: $prodDb" }
$authMode = Get-EnvValue $configPath "AUTH_MODE"
$authDisabled = Get-EnvValue $configPath "AUTH_DISABLED"
if ($authMode.ToUpperInvariant() -ne "LOCAL" -or $authDisabled.ToLowerInvariant() -eq "true") {
    throw "Production auth must be enabled with AUTH_MODE=LOCAL and AUTH_DISABLED=false. Run Configure-Production-Auth.ps1 before deployment."
}
$healthSecret = Get-EnvValue $configPath "HEALTH_DETAILS_SECRET"
if ([string]::IsNullOrWhiteSpace($healthSecret)) { throw "HEALTH_DETAILS_SECRET is missing from Production config. Re-run Configure-Production-Auth.ps1." }

Write-Host "==> 1/8 Copying source into isolated build workspace" -ForegroundColor Cyan
$rcArgs = @($SourcePath,$buildPath,"/E","/R:1","/W:1","/NFL","/NDL","/NJH","/NJS","/NP","/XD",".next","node_modules",".git","data","backups","logs","Patches","/XF",".env*","*.sqlite","*.sqlite-*","*.db")
& robocopy.exe @rcArgs | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy failed with code $LASTEXITCODE" }
$envExampleSource = Join-Path $SourcePath ".env.example"
if (Test-Path -LiteralPath $envExampleSource) {
    Copy-Item -LiteralPath $envExampleSource -Destination (Join-Path $buildPath ".env.example") -Force
}
$nodeModulesSource = Join-Path $SourcePath "node_modules"
$nodeModulesLink = Join-Path $buildPath "node_modules"
$copyNodeModules = @($nodeModulesSource,$nodeModulesLink,"/E","/R:1","/W:1","/NFL","/NDL","/NJH","/NJS","/NP")
& robocopy.exe @copyNodeModules | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Could not copy node_modules into isolated build workspace. Robocopy code $LASTEXITCODE" }

try {
    Write-Host "==> 2/8 Validating source" -ForegroundColor Cyan
    Run-Native "node.exe" @("scripts\check-stable-v1.13.mjs",".") $buildPath
    if(-not $SkipLint){ Run-Native "npm.cmd" @("run","lint") $buildPath }

    Write-Host "==> 3/8 Building standalone release OUTSIDE Dev" -ForegroundColor Cyan
    Run-Native "npm.cmd" @("run","build") $buildPath
    if(-not (Test-Path -LiteralPath (Join-Path $buildPath ".next\standalone\server.js"))){ throw "Standalone build was not generated." }

    if(-not $SkipTests){
        Write-Host "==> 4/8 Running focused tests" -ForegroundColor Cyan
        $testFiles = @(Get-ChildItem -LiteralPath (Join-Path $buildPath "tests") -Filter "*.test.mjs" -File -ErrorAction SilentlyContinue)
        foreach($test in $testFiles){ Run-Native "node.exe" @("--test",$test.FullName) $buildPath }
    } else { Write-Host "==> 4/8 Tests skipped by request" -ForegroundColor Yellow }

    Write-Host "==> 5/8 Creating immutable runtime release" -ForegroundColor Cyan
    New-Item -ItemType Directory -Force $releasePath | Out-Null
    $releaseCopy = @((Join-Path $buildPath ".next\standalone"),$releasePath,"/E","/R:1","/W:1","/NFL","/NDL","/NJH","/NJS","/NP")
    & robocopy.exe @releaseCopy | Out-Null
    if($LASTEXITCODE -gt 7){throw "Failed to copy standalone runtime; robocopy code $LASTEXITCODE"}
    Copy-Item -LiteralPath (Join-Path $SourcePath "scripts\stable-backup-db.mjs") -Destination (Join-Path $releasePath "backup-db.mjs") -Force
    Set-Content -LiteralPath (Join-Path $releasePath "RELEASE.txt") -Value @("IncidentHub $releaseVersion","Built: $(Get-Date -Format o)","Source: $SourcePath","Commit: $sourceCommit") -Encoding UTF8

    Write-Host "==> 6/8 Taking online Production backup before cutover" -ForegroundColor Cyan
    $env:DB_PATH = $prodDb
    $env:INCIDENT_IMAGES_DIR = $prodImages
    $env:BACKUP_DIR = Join-Path $Root "Backups\Prod"
    Run-Native "node.exe" @((Join-Path $releasePath "backup-db.mjs")) $releasePath

    Write-Host "Validating migrations against an online clone of Production" -ForegroundColor Cyan
    $env:PREFLIGHT_DB_PATH = Join-Path $deployBackup "migration-preflight.sqlite"
    try {
        Run-Native "node.exe" @("scripts\preflight-production-migrations.mjs") $buildPath
    } finally {
        Remove-Item Env:PREFLIGHT_DB_PATH -ErrorAction SilentlyContinue
    }

    $oldTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if($oldTask){
        $hadOldTask = $true
        Export-ScheduledTask -TaskName $TaskName | Set-Content -LiteralPath $oldTaskXml -Encoding Unicode
    }

    Write-Host "==> 7/8 Switching runtime and registering background tasks" -ForegroundColor Cyan
    $cutover = $true
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Stop-Port $Port
    if(-not (Wait-PortFree $Port 30)){throw "Port $Port did not become free."}
    Run-Native "node.exe" @("scripts\migrate-db.mjs") $buildPath

    Copy-Item -LiteralPath (Join-Path $SourcePath "scripts\Start-Stable-Production.ps1") -Destination (Join-Path $toolsPath "Start-Stable-Production.ps1") -Force
    Copy-Item -LiteralPath (Join-Path $SourcePath "scripts\Backup-Stable-Production.ps1") -Destination (Join-Path $toolsPath "Backup-Stable-Production.ps1") -Force
    Set-Junction $currentPath $releasePath
    Register-Tasks $toolsPath $nodeExe
    Start-ScheduledTask -TaskName $TaskName

    Write-Host "==> 8/8 Health check" -ForegroundColor Cyan
    $health = Wait-Health $Port $healthSecret 120
    if ($health.version -ne $releaseVersion) { throw "Health version mismatch. Expected $releaseVersion, received $($health.version)." }
    if($oldCurrentTarget -and (Test-Path -LiteralPath $oldCurrentTarget)){ Set-Junction $previousPath $oldCurrentTarget }

    Write-Host ""; Write-Host "[OK] IncidentHub Stable is running in the background." -ForegroundColor Green
    Write-Host "[OK] Release: $releasePath" -ForegroundColor Green
    Write-Host "[OK] Health: $($health.status) | Version: $($health.version)" -ForegroundColor Green
    Write-Host "[OK] Closing this PowerShell window will NOT stop IncidentHub." -ForegroundColor Green
    Write-Host "[OK] Task Scheduler restarts Node automatically if it exits." -ForegroundColor Green

    $protected = @($releasePath,$oldCurrentTarget) | Where-Object { $_ }
    $others = @(Get-ChildItem -LiteralPath $releasesRoot -Directory | Sort-Object LastWriteTime -Descending | Where-Object { $protected -notcontains $_.FullName })
    $others | Select-Object -Skip ([Math]::Max(1,$KeepReleases-1)) | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
catch {
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
    if($cutover){
        Write-Host "Attempting automatic runtime rollback..." -ForegroundColor Yellow
        try {
            Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
            Stop-Port $Port
            if($oldCurrentTarget -and (Test-Path -LiteralPath $oldCurrentTarget)){ Set-Junction $currentPath $oldCurrentTarget }
            if($hadOldTask -and (Test-Path -LiteralPath $oldTaskXml)){
                Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
                Register-ScheduledTask -TaskName $TaskName -Xml (Get-Content -LiteralPath $oldTaskXml -Raw -Encoding Unicode) -Force | Out-Null
                Start-ScheduledTask -TaskName $TaskName
                Write-Host "[OK] Previous Scheduled Task restored." -ForegroundColor Green
            }
        } catch { Write-Host "[WARN] Automatic rollback also failed: $($_.Exception.Message)" -ForegroundColor Yellow }
    }
    throw
}
finally {
    if(Test-Path -LiteralPath $nodeModulesLink){ Remove-Item -LiteralPath $nodeModulesLink -Recurse -Force -ErrorAction SilentlyContinue }
}
