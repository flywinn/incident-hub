param(
  [string]$TaskName = "ELK Incident Hub",
  [string]$MaintenanceTaskName = "ELK Incident Hub Maintenance"
)
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $MaintenanceTaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Scheduled tasks '$TaskName' and '$MaintenanceTaskName' removed."
