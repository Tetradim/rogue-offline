@echo off
cd /d "%~dp0"
echo Launching Pokerogue Pokemon Creator...

:: Create desktop shortcut
powershell -ExecutionPolicy Bypass -Command ^
"$desktop=[Environment]::GetFolderPath('Desktop'); "^
"$shortcut=Join-Path $desktop 'Pokerogue Pokemon Creator.url'; "^
"$html='file:///'+([System.IO.Path]::GetFullPath('launcher.html').Replace('\','/')); "^
"@('[InternetShortcut]','URL='+$html) | Out-File -FilePath $shortcut -Encoding UTF8 -Force; "^
"Write-Host 'Desktop shortcut created!'"

:: Open in default browser
start "" "launcher.html"

:: Or use specific browsers:
:: start "" "chrome.exe" "launcher.html"
:: start "" "firefox.exe" "launcher.html"