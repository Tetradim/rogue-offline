@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title PokeRogue Mod Studio - Updating Launcher

(
    echo ================================================
    echo   PokeRogue Mod Studio - Updating Launcher
    echo ================================================
    echo.

    set "PRMS_SELF=%~f0"
    set "PRMS_TEMP_PS=%TEMP%\pokerogue-mod-studio-update-!RANDOM!-!RANDOM!.ps1"
    set "UPDATE_CODE=0"

    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$raw=[IO.File]::ReadAllText($env:PRMS_SELF);$parts=[regex]::Split($raw,'(?m)^:__PRMS_POWERSHELL__\s*$',2);if($parts.Count -ne 2){exit 2};[IO.File]::WriteAllText($env:PRMS_TEMP_PS,$parts[1],[Text.UTF8Encoding]::new($false))"
    if errorlevel 1 (
        set "UPDATE_CODE=1"
    ) else (
        powershell.exe -NoProfile -ExecutionPolicy Bypass -File "!PRMS_TEMP_PS!" -ToolPath "%~dp0"
        set "UPDATE_CODE=!errorlevel!"
    )

    del /q "!PRMS_TEMP_PS!" >nul 2>&1
    if not "!UPDATE_CODE!"=="0" (
        echo.
        echo [WARN] Updating failed. The installed local version will be launched unchanged.
        echo.
    )

    call "%~dp0Launch-Offline.bat"
    set "LAUNCH_CODE=!errorlevel!"
    exit /b !LAUNCH_CODE!
)

:__PRMS_POWERSHELL__
param(
    [Parameter(Mandatory = $true)]
    [string]$ToolPath
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repoOwner = 'Tetradim'
$repoName = 'rogue-offline'
$branch = 'main'
$headers = @{ 'User-Agent' = 'PokeRogue-Mod-Studio-Updater' }
$toolRoot = [IO.Path]::GetFullPath($ToolPath).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
$versionFile = Join-Path $toolRoot '.launcher-version'
$manifestFile = Join-Path $toolRoot '.launcher-update-manifest.json'

function Normalize-RelativePath([string]$RelativePath) {
    if ([string]::IsNullOrWhiteSpace($RelativePath) -or [IO.Path]::IsPathRooted($RelativePath)) {
        throw "Unsafe updater path: $RelativePath"
    }
    $parts = $RelativePath.Replace('/', [IO.Path]::DirectorySeparatorChar).Split([IO.Path]::DirectorySeparatorChar)
    if ($parts | Where-Object { $_ -eq '..' -or $_ -eq '' }) {
        throw "Unsafe updater path: $RelativePath"
    }
    return ($parts -join [IO.Path]::DirectorySeparatorChar)
}

function Resolve-ToolPath([string]$RelativePath) {
    $safe = Normalize-RelativePath $RelativePath
    $candidate = [IO.Path]::GetFullPath((Join-Path $toolRoot $safe))
    $prefix = $toolRoot + [IO.Path]::DirectorySeparatorChar
    if (-not $candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Updater path escaped Tool/: $RelativePath"
    }
    return $candidate
}

function Write-AtomicText([string]$Path, [string]$Value) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "$Path.$PID.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporary, $Value, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

Write-Host '[UPDATE] Checking GitHub main...' -ForegroundColor Cyan
try {
    $latest = Invoke-RestMethod \
        -Uri "https://api.github.com/repos/$repoOwner/$repoName/commits/$branch" \
        -Headers $headers \
        -TimeoutSec 15
    $latestSha = [string]$latest.sha
} catch {
    Write-Host "[WARN] GitHub could not be reached: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '[INFO] Continuing with the installed local version.' -ForegroundColor Gray
    exit 0
}

$currentSha = if (Test-Path -LiteralPath $versionFile) {
    (Get-Content -LiteralPath $versionFile -Raw).Trim()
} else {
    ''
}

if ($currentSha -eq $latestSha) {
    Write-Host "[OK] Already current at $($latestSha.Substring(0, 8))." -ForegroundColor Green
    exit 0
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("pokerogue-mod-studio-update-" + [Guid]::NewGuid().ToString('N'))
$archiveFile = Join-Path $tempRoot 'repository.zip'
$extractRoot = Join-Path $tempRoot 'extracted'
$backupRoot = Join-Path $tempRoot 'backup'
$records = [Collections.Generic.List[object]]::new()
$recorded = @{}

function Backup-Destination([string]$RelativePath) {
    $safe = Normalize-RelativePath $RelativePath
    if ($recorded.ContainsKey($safe)) { return }
    $destination = Resolve-ToolPath $safe
    $exists = Test-Path -LiteralPath $destination
    if ($exists -and -not (Test-Path -LiteralPath $destination -PathType Leaf)) {
        throw "Updater expected a file but found another item: $safe"
    }
    $backup = Join-Path $backupRoot $safe
    if ($exists) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
        Copy-Item -LiteralPath $destination -Destination $backup -Force
    }
    $records.Add([pscustomobject]@{
        RelativePath = $safe
        Existed = $exists
        BackupPath = $backup
    })
    $recorded[$safe] = $true
}

function Install-File([string]$SourcePath, [string]$RelativePath) {
    $safe = Normalize-RelativePath $RelativePath
    Backup-Destination $safe
    $destination = Resolve-ToolPath $safe
    New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
    $temporary = "$destination.$PID.$([Guid]::NewGuid().ToString('N')).updating"
    try {
        Copy-Item -LiteralPath $SourcePath -Destination $temporary -Force
        Move-Item -LiteralPath $temporary -Destination $destination -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

try {
    New-Item -ItemType Directory -Path $extractRoot, $backupRoot -Force | Out-Null
    Write-Host "[UPDATE] Downloading $repoOwner/$repoName $branch..." -ForegroundColor Cyan
    Invoke-WebRequest \
        -Uri "https://github.com/$repoOwner/$repoName/archive/refs/heads/$branch.zip" \
        -OutFile $archiveFile \
        -UseBasicParsing \
        -Headers $headers \
        -TimeoutSec 120
    Expand-Archive -LiteralPath $archiveFile -DestinationPath $extractRoot -Force

    $repositoryRoot = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
    if (-not $repositoryRoot) { throw 'The downloaded repository archive was empty.' }
    $sourceRoot = Join-Path $repositoryRoot.FullName 'Tool'
    foreach ($required in @('package.json', 'server\index.js', 'Launch-Updating.bat', 'Launch-Offline.bat')) {
        if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $required) -PathType Leaf)) {
            throw "The downloaded Tool/ tree is incomplete: $required is missing."
        }
    }

    $sourceFiles = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -Force | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($sourceRoot, $_.FullName)
        [pscustomobject]@{ RelativePath = Normalize-RelativePath $relative; FullName = $_.FullName }
    } | Where-Object {
        $_.RelativePath -notin @('.launcher-version', '.launcher-update-manifest.json', '.launcher-deps.sha256')
    }

    $sourceSet = @{}
    foreach ($file in $sourceFiles) { $sourceSet[$file.RelativePath] = $true }

    $previousManaged = @()
    if (Test-Path -LiteralPath $manifestFile) {
        $parsed = Get-Content -LiteralPath $manifestFile -Raw | ConvertFrom-Json
        if ($parsed -is [Array]) { $previousManaged = @($parsed) }
    }

    $obsoleteLaunchers = @(
        'Launch.bat',
        'Launch.bat.ps1',
        'LauncherWithUpdater.bat',
        'SimpleLaunch.bat',
        'Updater.ps1',
        'UpdaterOnly.bat',
        'update_js.py'
    )
    $removePaths = @($previousManaged + $obsoleteLaunchers) | ForEach-Object {
        Normalize-RelativePath ([string]$_)
    } | Where-Object {
        -not $sourceSet.ContainsKey($_)
    } | Sort-Object -Unique

    Write-Host "[UPDATE] Installing $($sourceFiles.Count) files..." -ForegroundColor Cyan
    foreach ($file in $sourceFiles) {
        Install-File $file.FullName $file.RelativePath
    }

    foreach ($relative in $removePaths) {
        $destination = Resolve-ToolPath $relative
        if (Test-Path -LiteralPath $destination -PathType Leaf) {
            Backup-Destination $relative
            Remove-Item -LiteralPath $destination -Force
        }
    }

    Backup-Destination '.launcher-update-manifest.json'
    Backup-Destination '.launcher-version'
    $managed = @($sourceFiles.RelativePath | Sort-Object -Unique)
    Write-AtomicText $manifestFile (($managed | ConvertTo-Json) + [Environment]::NewLine)
    Write-AtomicText $versionFile ($latestSha + [Environment]::NewLine)

    Write-Host "[OK] Updated to $($latestSha.Substring(0, 8))." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Update failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '[ROLLBACK] Restoring the previous local files...' -ForegroundColor Yellow
    for ($index = $records.Count - 1; $index -ge 0; $index--) {
        $record = $records[$index]
        try {
            $destination = Resolve-ToolPath $record.RelativePath
            if ($record.Existed) {
                New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
                Copy-Item -LiteralPath $record.BackupPath -Destination $destination -Force
            } else {
                Remove-Item -LiteralPath $destination -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Host "[WARN] Rollback could not restore $($record.RelativePath): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    exit 1
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

exit 0
