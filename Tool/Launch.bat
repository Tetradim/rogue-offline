@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "SCRIPT_DIR=%~dp0"
set "HTML_PATH=%SCRIPT_DIR%launcher.html"
set "DESKTOP=%USERPROFILE%\Desktop"
set "SHORTCUT=%DESKTOP%\Pokerogue Pokemon Creator.url"

echo ================================================
echo   Pokerogue Pokemon Creator - Launcher v1.0
echo ================================================
echo.

:: Check if launcher.html exists
if not exist "%HTML_PATH%" (
    echo [ERROR] launcher.html not found!
    echo [ERROR] Please ensure all files are extracted.
    echo.
    echo --- COPY BELOW FOR SUPPORT ---
    echo ERROR: launcher.html not found in %SCRIPT_DIR%
    echo ------------------------------
    pause
    exit /b 1
)

:: Create desktop shortcut
echo [1/2] Creating desktop shortcut...
powershell -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $desktop='%DESKTOP%'; $shortcut='%SHORTCUT%'; $html='file:///'+([System.IO.Path]::GetFullPath('%HTML_PATH%').Replace('\','/')); @('[InternetShortcut]','URL='+$html) | Out-File -FilePath $shortcut -Encoding UTF8 -Force; Write-Host '[OK] Shortcut created successfully!'; } catch { Write-Host '[WARN] Could not create shortcut: '$_.Exception.Message; }" 2>nul

:: Open in default browser
echo [2/2] Opening in browser...
echo.
echo ================================================
echo   SUCCESS! The app should open in your browser.
echo   If not, double-click 'launcher.html' manually.
echo ================================================
echo.
echo --- COPY FOR SUPPORT IF NEEDED ---
echo DATE: %date% %time%
echo PATH: %HTML_PATH%
echo USER: %USERNAME%
echo -------------------------------

start "" "%HTML_PATH%"
timeout /t 3 >nul