$ErrorActionPreference = "Continue"

$ProjectPath = "D:\IncidentHub\Dev"
$LogDirectory = Join-Path $ProjectPath "logs"
$LogPath = Join-Path $LogDirectory "dev-server.log"
$NpmPath = "C:\Program Files\nodejs\npm.cmd"

New-Item `
  -ItemType Directory `
  -Force `
  $LogDirectory |
Out-Null

try {
    Add-Content `
      -Path $LogPath `
      -Value ("`r`n===== Start: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " =====")

    if (-not (Test-Path $ProjectPath)) {
        throw "Project path does not exist: $ProjectPath"
    }

    if (-not (Test-Path $NpmPath)) {
        throw "npm.cmd does not exist: $NpmPath"
    }

    Set-Location $ProjectPath

    $env:NO_PROXY = "127.0.0.1,localhost,172.25.3.8"
    $env:no_proxy = "127.0.0.1,localhost,172.25.3.8"
    $env:NODE_ENV = "development"
    $env:PATH = "C:\Program Files\nodejs;" + $env:PATH

    Add-Content `
      -Path $LogPath `
      -Value ("Running npm from: " + $NpmPath)

    & $NpmPath run dev 2>&1 |
      Tee-Object `
        -FilePath $LogPath `
        -Append

    $ExitCode = $LASTEXITCODE

    Add-Content `
      -Path $LogPath `
      -Value ("===== Exit: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " / Code: " + $ExitCode + " =====")

    exit $ExitCode
}
catch {
    Add-Content `
      -Path $LogPath `
      -Value ("FATAL: " + $_.Exception.Message)

    Add-Content `
      -Path $LogPath `
      -Value $_.ScriptStackTrace

    exit 1
}
