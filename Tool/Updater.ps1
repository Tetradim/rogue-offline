# ================================================
# Pokerogue Pokemon Creator - Self Updater v1.1
# ================================================

$RepoOwner = "Tetradim"
$RepoName = "rogue-offline"
$Branch = "move-audio-to-tetradim"

$ToolPath = $PSScriptRoot
$VersionFile = Join-Path $ToolPath ".updater.version"

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  Pokerogue Pokemon Creator Updater v1.1" -ForegroundColor Cyan
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

# Read local version (trim whitespace)
$CurrentSha = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }

if ($CurrentSha -eq $LatestSha -and $CurrentSha -ne "" -and $CurrentSha -ne "offline") {
    Write-Host "[OK] Already up to date!" -ForegroundColor Green
    Write-Host "    Version: $CurrentSha" -ForegroundColor Gray
} else {
    Write-Host "[INFO] Checking for updates..." -ForegroundColor Magenta
    if ($CurrentSha -ne "" -and $CurrentSha -ne "offline") {
        Write-Host "    Local: $CurrentSha | GitHub: $LatestSha" -ForegroundColor Gray
    }

    $script:updatedCount = 0
    $script:failedCount = 0

    # Files to sync from Tool/ root
    $FilesToUpdate = @{
        "Tool/index.html"      = "index.html"
        "Tool/Launch.bat"      = "Launch.bat"
        "Tool/Launch.bat.ps1"  = "Launch.bat.ps1"
        "Tool/README.md"       = "README.md"
        "Tool/Updater.ps1"    = "Updater.ps1"
    }

    Write-Host ""
    Write-Host "  Syncing launcher files..." -ForegroundColor Cyan

    foreach ($remotePath in $FilesToUpdate.Keys) {
        $localName = $FilesToUpdate[$remotePath]
        $LocalFullPath = Join-Path $ToolPath $localName
        $RawUrl = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$Branch/$remotePath"

        try {
            Invoke-WebRequest -Uri $RawUrl -OutFile $LocalFullPath -UseBasicParsing -TimeoutSec 30
            Write-Host "  [OK] $localName" -ForegroundColor Green
            $script:updatedCount++
        } catch {
            Write-Host "  [SKIP] $localName" -ForegroundColor Gray
        }
    }

    # Sync dist folder
    Write-Host ""
    Write-Host "  Syncing application files..." -ForegroundColor Cyan
    
    # Create folders
    $distPath = Join-Path $ToolPath "dist"
    $distAssetsPath = Join-Path $distPath "assets"
    if (-not (Test-Path $distAssetsPath)) {
        New-Item -ItemType Directory -Path $distAssetsPath -Force | Out-Null
    }

    # Get file list from GitHub tree
    try {
        $treeUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/git/trees/$Branch?recursive=1"
        $Headers2 = @{ "User-Agent" = "Pokerogue-Updater" }
        $treeResponse = Invoke-RestMethod -Uri $treeUrl -Headers $Headers2 -TimeoutSec 30
        
        # Find all files in Tool/dist/
        $distFiles = $treeResponse.tree | Where-Object { 
            $_.path -like "Tool/dist/*" -and 
            ($_.path -like "*.js" -or $_.path -like "*.css" -or $_.path -like "*.html") 
        }
        
        Write-Host "  Found $($distFiles.Count) application files" -ForegroundColor Gray
        
        foreach ($file in $distFiles) {
            # Remove "Tool/" prefix from path
            $relativePath = $file.path -replace "^Tool/", ""
            $localPath = Join-Path $ToolPath $relativePath
            $localDir = Split-Path $localPath -Parent
            
            # Create directory if needed
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
        Write-Host "  [WARN] Could not fetch file list" -ForegroundColor Yellow
        $script:failedCount++
    }

    # Save new version only if we updated something
    if ($script:updatedCount -gt 0 -or $CurrentSha -ne $LatestSha) {
        $LatestSha | Out-File $VersionFile -Encoding utf8
    }
    
    Write-Host ""
    if ($script:failedCount -eq 0) {
        Write-Host "[OK] Update completed!" -ForegroundColor Green
    } else {
        Write-Host "[OK] Update completed with warnings" -ForegroundColor Yellow
    }
    Write-Host "    Files processed: $script:updatedCount" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Launching Pokerogue Pokemon Creator..." -ForegroundColor Cyan
Write-Host ""

Start-Sleep -Milliseconds 500

# Start the local server
$LaunchBat = Join-Path $ToolPath "Launch.bat.ps1"
if (Test-Path $LaunchBat) {
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File `"$LaunchBat`""
} else {
    Write-Host "[WARN] Launch.bat.ps1 not found" -ForegroundColor Red
    Start-Sleep -Seconds 2
}

exit 0