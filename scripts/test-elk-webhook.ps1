param(
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$Secret,
  [string]$PayloadPath = (Join-Path $PSScriptRoot "..\examples\elk-payload.json")
)

$headers = @{ Authorization = "Bearer $Secret" }
Invoke-RestMethod -Method Post -Uri "$($BaseUrl.TrimEnd('/'))/api/integrations/elk/alerts" -Headers $headers -ContentType "application/json" -InFile $PayloadPath
