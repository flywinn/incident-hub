[CmdletBinding()]
param(
  [string]$TaskName = "ELK Incident Hub",
  [string]$MaintenanceTaskName = "ELK Incident Hub Maintenance",
  [string]$ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$startScript = Join-Path $ProjectPath "scripts\start-windows.cmd"
$maintenanceScript = Join-Path $ProjectPath "scripts\run-maintenance.ps1"
if (-not (Test-Path $startScript)) { throw "Start script not found: $startScript" }
if (-not (Test-Path $maintenanceScript)) { throw "Maintenance script not found: $maintenanceScript" }

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$appSettings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
$appAction = New-ScheduledTaskAction -Execute "C:\Windows\System32\cmd.exe" -Argument "/c `"$startScript`"" -WorkingDirectory $ProjectPath
$appTrigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName $TaskName -Action $appAction -Trigger $appTrigger -Principal $principal -Settings $appSettings -Force | Out-Null

$maintenanceSettings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable
$maintenanceAction = New-ScheduledTaskAction -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$maintenanceScript`" -ProjectPath `"$ProjectPath`"" -WorkingDirectory $ProjectPath
$maintenanceTrigger = New-ScheduledTaskTrigger -Daily -At 2:30am
Register-ScheduledTask -TaskName $MaintenanceTaskName -Action $maintenanceAction -Trigger $maintenanceTrigger -Principal $principal -Settings $maintenanceSettings -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Scheduled task '$TaskName' installed and started."
Write-Host "Scheduled task '$MaintenanceTaskName' installed for daily backup at 02:30."
