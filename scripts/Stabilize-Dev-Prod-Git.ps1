#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ReleaseSource = "D:\IncidentHub\Dev-1.15-fixed-v3",
    [string]$RepoPath = "D:\IncidentHub-GitHub",
    [string]$Root = "D:\IncidentHub",
    [string]$RemoteName = "origin",
    [string]$ExpectedGitHubRepo = "flywinn/incident-hub",
    [string]$TaskName = "ELK Incident Hub",
    [int]$ProductionPort = 3000,
    [int]$DevPort = 3001
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this script from PowerShell as Administrator."
    }
}

function Invoke-Native([string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        & $File @Arguments
        if ($LASTEXITCODE -ne 0) { throw "$File failed with exit code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}

function Invoke-NativeText([string]$File, [string[]]$Arguments, [string]$WorkingDirectory) {
    Push-Location $WorkingDirectory
    try {
        $output = @(& $File @Arguments 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "$File failed with exit code $LASTEXITCODE`n$($output -join [Environment]::NewLine)"
        }
        return (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
    }
    finally { Pop-Location }
}

function Stop-NodePort([int]$Port) {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    foreach ($listener in $listeners) {
        $processId = [int]$listener.OwningProcess
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
        if ($process -and $process.Name -notmatch '^node(\.exe)?$') {
            throw "Port $Port belongs to non-Node process PID $processId ($($process.Name))."
        }
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

function Get-EnvValue([string]$Path, [string]$Key) {
    $line = Get-Content -LiteralPath $Path | Where-Object {
        $_ -match ('^\s*' + [regex]::Escape($Key) + '\s*=')
    } | Select-Object -Last 1
    if (-not $line) { return "" }
    return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = [Collections.Generic.List[string]]::new()
    foreach ($line in @(Get-Content -LiteralPath $Path -Encoding UTF8)) { $lines.Add([string]$line) }
    $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
    $replacement = "$Key=$Value"
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) {
            $lines[$i] = $replacement
            $found = $true
        }
    }
    if (-not $found) { $lines.Add($replacement) }
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Wait-ProductionHealth([int]$Port, [string]$Secret, [string]$Version, [string]$Commit, [int]$Seconds = 120) {
    $lastError = ""
    for ($i = 0; $i -lt $Seconds; $i++) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -Headers @{
                Authorization = "Bearer $Secret"
            } -TimeoutSec 5
            if ($health.status -eq "ok" -and $health.version -eq $Version -and
                $health.configuredVersion -eq $Version -and $health.commit -eq $Commit) {
                return $health
            }
            $lastError = "status=$($health.status), version=$($health.version), configuredVersion=$($health.configuredVersion), commit=$($health.commit)"
        }
        catch { $lastError = $_.Exception.Message }
        Start-Sleep -Seconds 1
    }
    throw "Production health did not match Git release after $Seconds seconds. Last result: $lastError"
}

Require-Admin

$releasePackage = Join-Path $ReleaseSource "package.json"
$repoPackage = Join-Path $RepoPath "package.json"
$gitPath = Join-Path $RepoPath ".git"
$prodConfig = Join-Path $Root "Config\Prod\.env.production"
$installer = Join-Path $RepoPath "scripts\Install-Stable-Production.ps1"

if (-not (Test-Path -LiteralPath $releasePackage)) { throw "Release source is invalid: $ReleaseSource" }
if (-not (Test-Path -LiteralPath $gitPath)) { throw "Git repository was not found: $RepoPath" }
if (-not (Test-Path -LiteralPath $prodConfig)) { throw "Production config was not found: $prodConfig" }

$gitExe = (Get-Command git.exe -ErrorAction Stop).Source
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
$npmExe = (Get-Command npm.cmd -ErrorAction Stop).Source
$sourceVersion = [string]((Get-Content -LiteralPath $releasePackage -Raw | ConvertFrom-Json).version)
if ($sourceVersion -notmatch '^\d+\.\d+\.\d+([-.][A-Za-z0-9.-]+)?$') { throw "Invalid release version: $sourceVersion" }
$tagName = "v$sourceVersion"

$remoteUrl = Invoke-NativeText $gitExe @("remote", "get-url", $RemoteName) $RepoPath
$expectedPattern = 'github\.com[:/]' + [regex]::Escape($ExpectedGitHubRepo) + '(\.git)?/?$'
if ($remoteUrl -notmatch $expectedPattern) {
    throw "Remote '$RemoteName' is not the expected GitHub repository. Found: $remoteUrl"
}

$branch = Invoke-NativeText $gitExe @("branch", "--show-current") $RepoPath
if ([string]::IsNullOrWhiteSpace($branch)) { throw "The repository is in detached HEAD state." }
$initialStatus = Invoke-NativeText $gitExe @("status", "--porcelain=v1") $RepoPath
if (-not [string]::IsNullOrWhiteSpace($initialStatus)) {
    throw "Git working tree is not clean. Commit or stash these changes first:`n$initialStatus"
}

Write-Host "==> 1/9 Updating $branch from GitHub with fast-forward only" -ForegroundColor Cyan
Invoke-Native $gitExe @("fetch", "--prune", "--tags", $RemoteName) $RepoPath
$remoteBranch = Invoke-NativeText $gitExe @("ls-remote", "--heads", $RemoteName, "refs/heads/$branch") $RepoPath
if (-not [string]::IsNullOrWhiteSpace($remoteBranch)) {
    Invoke-Native $gitExe @("pull", "--ff-only", $RemoteName, $branch) $RepoPath
}

Write-Host "==> 2/9 Synchronizing the verified source into Git" -ForegroundColor Cyan
$copyArguments = @(
    $ReleaseSource, $RepoPath, "/E", "/R:1", "/W:1", "/NFL", "/NDL", "/NJH", "/NJS", "/NP",
    "/XD", ".git", ".next", "node_modules", "data", "backups", "logs", "Build", "Releases", "State", "Config", "Prod",
    "/XF", ".env", ".env.local", ".env.production", "*.sqlite", "*.sqlite-*", "*.db", "*.log"
)
& robocopy.exe @copyArguments | Out-Null
if ($LASTEXITCODE -gt 7) { throw "Source synchronization failed. Robocopy code: $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $repoPackage)) { throw "package.json disappeared during synchronization." }

$repoVersion = [string]((Get-Content -LiteralPath $repoPackage -Raw | ConvertFrom-Json).version)
if ($repoVersion -ne $sourceVersion) { throw "Version mismatch: source=$sourceVersion repo=$repoVersion" }

Write-Host "==> 3/9 Stopping only the Dev listener and installing locked dependencies" -ForegroundColor Cyan
Stop-NodePort $DevPort
Invoke-Native $npmExe @("ci", "--include=dev", "--no-audit", "--no-fund") $RepoPath

Write-Host "==> 4/9 Running lint, TypeScript, focused tests and production build" -ForegroundColor Cyan
Invoke-Native $npmExe @("run", "lint") $RepoPath
Invoke-Native $nodeExe @("node_modules\typescript\bin\tsc", "--noEmit", "--incremental", "false") $RepoPath
$testFiles = @(Get-ChildItem -LiteralPath (Join-Path $RepoPath "tests") -Filter "*.test.mjs" -File)
foreach ($testFile in $testFiles) { Invoke-Native $nodeExe @("--test", $testFile.FullName) $RepoPath }
Invoke-Native $npmExe @("run", "build") $RepoPath
Invoke-Native $gitExe @("diff", "--check") $RepoPath

Write-Host "==> 5/9 Checking the exact Git change set" -ForegroundColor Cyan
Invoke-Native $gitExe @("add", "--all") $RepoPath
$stagedNames = Invoke-NativeText $gitExe @("diff", "--cached", "--name-only") $RepoPath
$tagBeforeCommit = ""
try { $tagBeforeCommit = Invoke-NativeText $gitExe @("rev-parse", "refs/tags/$tagName^{}") $RepoPath } catch { $tagBeforeCommit = "" }
if (-not [string]::IsNullOrWhiteSpace($stagedNames) -and -not [string]::IsNullOrWhiteSpace($tagBeforeCommit)) {
    throw "Tag $tagName already exists, but the source has new changes. Bump package.json before releasing."
}
foreach ($name in @($stagedNames -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($name)) { continue }
    if (($name -match '(^|/)\.env($|\.)' -and $name -notmatch '(^|/)\.env\.example$') -or
        $name -match '\.(sqlite|sqlite3|db)(-|$)' -or $name -match '(^|/)(data|backups|logs)/') {
        throw "Sensitive/runtime file was staged and Push was blocked: $name"
    }
}

Write-Host "GitHub: $remoteUrl" -ForegroundColor White
Write-Host "Branch: $branch | Version: $sourceVersion | Tag: $tagName" -ForegroundColor White
if ([string]::IsNullOrWhiteSpace($stagedNames)) {
    Write-Host "No source differences; the current commit will be tagged/deployed." -ForegroundColor Yellow
}
else {
    Invoke-Native $gitExe @("diff", "--cached", "--stat") $RepoPath
}
$confirmation = Read-Host "Type PUSH to commit, push, tag and deploy this exact revision"
if ($confirmation -cne "PUSH") { throw "Cancelled. Nothing was pushed or deployed." }

Write-Host "==> 6/9 Creating the release commit and immutable tag" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($stagedNames)) {
    Invoke-Native $gitExe @("commit", "-m", "release: IncidentHub $sourceVersion local auth and PRTG") $RepoPath
}
$commit = Invoke-NativeText $gitExe @("rev-parse", "HEAD") $RepoPath
$existingTag = ""
try { $existingTag = Invoke-NativeText $gitExe @("rev-parse", "refs/tags/$tagName^{}") $RepoPath } catch { $existingTag = "" }
if (-not [string]::IsNullOrWhiteSpace($existingTag) -and $existingTag -ne $commit) {
    throw "Tag $tagName already points to another commit ($existingTag). Bump package.json before releasing."
}
if ([string]::IsNullOrWhiteSpace($existingTag)) {
    Invoke-Native $gitExe @("tag", "-a", $tagName, "-m", "IncidentHub $sourceVersion stable") $RepoPath
}

Write-Host "==> 7/9 Pushing branch and tag atomically to GitHub" -ForegroundColor Cyan
Invoke-Native $gitExe @(
    "push", "--atomic", $RemoteName,
    "HEAD:refs/heads/$branch",
    "refs/tags/${tagName}:refs/tags/${tagName}"
) $RepoPath

Write-Host "==> 8/9 Deploying Production from the same Git commit" -ForegroundColor Cyan
$backupDirectory = Join-Path $Root ("Backups\GitSync\" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force $backupDirectory | Out-Null
$configBackup = Join-Path $backupDirectory ".env.production"
Copy-Item -LiteralPath $prodConfig -Destination $configBackup -Force
try {
    Set-EnvValue $prodConfig "APP_VERSION" $sourceVersion
    Set-EnvValue $prodConfig "APP_COMMIT" $commit
    if (-not (Test-Path -LiteralPath $installer)) { throw "Production installer not found: $installer" }
    & $installer -Root $Root -SourcePath $RepoPath -TaskName $TaskName -Port $ProductionPort
}
catch {
    Copy-Item -LiteralPath $configBackup -Destination $prodConfig -Force
    throw
}

Write-Host "==> 9/9 Proving Git, Dev source and Production are aligned" -ForegroundColor Cyan
$healthSecret = Get-EnvValue $prodConfig "HEALTH_DETAILS_SECRET"
if ([string]::IsNullOrWhiteSpace($healthSecret)) { throw "HEALTH_DETAILS_SECRET is missing after deployment." }
$health = Wait-ProductionHealth $ProductionPort $healthSecret $sourceVersion $commit 120
$finalStatus = Invoke-NativeText $gitExe @("status", "--porcelain=v1") $RepoPath
if (-not [string]::IsNullOrWhiteSpace($finalStatus)) { throw "Git became dirty after release:`n$finalStatus" }

$stateDirectory = Join-Path $Root "State\GitSync"
New-Item -ItemType Directory -Force $stateDirectory | Out-Null
$reportPath = Join-Path $stateDirectory ("sync-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
[ordered]@{
    generatedAt = (Get-Date).ToString("o")
    github = $remoteUrl
    branch = $branch
    tag = $tagName
    commit = $commit
    version = $sourceVersion
    canonicalDevSource = $RepoPath
    productionTask = $TaskName
    productionPort = $ProductionPort
    productionHealth = $health
    databaseSynchronization = "NOT_PERFORMED"
    telegramTest = "DEFERRED"
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding UTF8

Write-Host "" 
Write-Host "[OK] GitHub, canonical Dev source and Production are aligned." -ForegroundColor Green
Write-Host "[OK] Version: $sourceVersion | Commit: $commit | Tag: $tagName" -ForegroundColor Green
Write-Host "[OK] Canonical Dev path: $RepoPath" -ForegroundColor Green
Write-Host "[OK] Production health: $($health.status) on port $ProductionPort" -ForegroundColor Green
Write-Host "[OK] Sync report: $reportPath" -ForegroundColor Green
Write-Host "[INFO] Telegram was intentionally not tested." -ForegroundColor Yellow
