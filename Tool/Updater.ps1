# ================================================
# Pokerogue Pokemon Creator - Self Updater
# Double-click the compiled .exe or run this script
# ================================================

$RepoOwner = "Tetradim"
$RepoName = "rogue-offline"
$Branch = "move-audio-to-tetradim"

$ToolPath = $PSScriptRoot
$VersionFile = Join-Path $ToolPath ".updater.version"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Pokerogue Pokemon Creator Updater v1.0" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check latest commit
$ApiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/commits/$Branch"
try {
    $Headers = @{ "User-Agent" = "Pokerogue-Updater" }
    $LatestCommit = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers -TimeoutSec 10
    $LatestSha = $LatestCommit.sha.Substring(0, 8)
    Write-Host "[OK] Connected to GitHub" -ForegroundColor Green
    Write-Host "    Latest commit: $LatestSha" -ForegroundColor Cyan
} catch {
    Write-Host "[WARN] Could not connect to GitHub. Starting local version..." -ForegroundColor Yellow
    $LatestSha = "offline"
}

Write-Host ""

# Read local version
$CurrentSha = if (Test-Path $VersionFile) { Get-Content $VersionFile -Raw } else { "" }

if ($CurrentSha -eq $LatestSha -and $CurrentSha -ne "" -and $CurrentSha -ne "offline") {
    Write-Host "[OK] Already up to date!" -ForegroundColor Green
    Write-Host "    Version: $CurrentSha" -ForegroundColor Gray
} else {
    Write-Host "[INFO] New version detected!" -ForegroundColor Magenta
    if ($CurrentSha -ne "" -and $CurrentSha -ne "offline") {
        Write-Host "    Previous: $CurrentSha" -ForegroundColor Gray
    }
    Write-Host "    Updating files..." -ForegroundColor Cyan

    # Files to sync
    $FilesToUpdate = @{
        "Tool/index.html"          = "index.html"
        "Tool/Launch.bat"          = "Launch.bat"
        "Tool/Launch.bat.ps1"      = "Launch.bat.ps1"
        "Tool/README.md"           = "README.md"
        "Tool/Updater.ps1"         = "Updater.ps1"
    }

    # Sync dist folder files
    $distFiles = @(
        "dist/index.html",
        "dist/assets/index-BSIVr7CH.css"
    )

    $script:updatedCount = 0
    $script:failedCount = 0

    foreach ($remotePath in $FilesToUpdate.Keys) {
        $localName = $FilesToUpdate[$remotePath]
        $LocalFullPath = Join-Path $ToolPath $localName
        $RawUrl = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Branch/$remotePath"

        try {
            Invoke-WebRequest -Uri $RawUrl -OutFile $LocalFullPath -UseBasicParsing -TimeoutSec 30
            Write-Host "  [OK] $localName" -ForegroundColor Green
            $script:updatedCount++
        } catch {
            Write-Host "  [FAIL] $localName" -ForegroundColor Red
            $script:failedCount++
        }
    }

    # Sync dist folder
    Write-Host ""
    Write-Host "  Syncing application files..." -ForegroundColor Cyan
    
    # Create dist folder if needed
    $distPath = Join-Path $ToolPath "dist"
    $distAssetsPath = Join-Path $distPath "assets"
    if (-not (Test-Path $distAssetsPath)) {
        New-Item -ItemType Directory -Path $distAssetsPath -Force | Out-Null
    }

    # Get file list from GitHub
    try {
        $treeUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/git/trees/$Branch?recursive=1"
        $tree = Invoke-RestMethod -Uri $treeUrl -Headers @{ "User-Agent" = "Pokerogue-Updater" } -TimeoutSec 30
        
        # Find all JS and CSS files in dist
        $distFiles = $tree.tree | Where-Object { $_.path -like "Tool/dist/*" -and ($_.path -like "*.js" -or $_.path -like "*.css" -or $_.path -like "*.html") }
        
        foreach ($file in $distFiles) {
            $relativePath = $file.path -replace "^Tool/", ""
            $localPath = Join-Path $ToolPath $relativePath
            $localDir = Split-Path $localPath -Parent
            
            if (-not (Test-Path $localDir)) {
                New-Item -ItemType Directory -Path $localDir -Force | Out-Null
            }
            
            $RawUrl = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Branch/$($file.path)"
            
            try {
                Invoke-WebRequest -Uri $RawUrl -OutFile $localPath -UseBasicParsing -TimeoutSec 30
                $script:updatedCount++
            } catch {
                $script:failedCount++
            }
        }
        Write-Host "  [OK] Application files synced" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Could not sync all files" -ForegroundColor Yellow
    }

    # Save new version
    $LatestSha | Out-File $VersionFile -Encoding utf8
    Write-Host ""
    Write-Host "[OK] Update completed!" -ForegroundColor Green
    Write-Host "    Files updated: $script:updatedCount" -ForegroundColor Gray
    if ($script:failedCount -gt 0) {
        Write-Host "    Files failed: $script:failedCount" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Launching Pokerogue Pokemon Creator..." -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Milliseconds 1500

# Start the local server
$LaunchBat = Join-Path $ToolPath "Launch.bat.ps1"
if (Test-Path $LaunchBat) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$LaunchBat`""
} else {
    Write-Host "Server script not found. Opening browser..." -ForegroundColor Yellow
    Start-Sleep -Seconds 1
    Start-Process "http://localhost:5173"
}

exit 0