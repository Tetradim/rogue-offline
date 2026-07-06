# Pokerogue Pokemon Creator Launcher
# Just opens the app in your default browser

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$htmlPath = Join-Path $scriptDir "launcher.html"

# Try to create desktop shortcut first
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Pokerogue Pokemon Creator.url"

$urlContent = @"
[InternetShortcut]
URL=file:///$htmlPath.Replace('\', '/')
"@

# Create shortcut (silent, won't interrupt user)
try {
    $urlContent | Out-File -FilePath $shortcutPath -Encoding UTF8 -Force
    Write-Host "Desktop shortcut created!"
} catch {
    # Silently continue if shortcut fails
}

# Open in default browser
Start-Process $htmlPath