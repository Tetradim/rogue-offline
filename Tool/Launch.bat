@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Pokerogue Pokemon Creator - Launcher v1.2
echo ================================================
echo.

REM Run updater if present
if exist "%~dp0Updater.ps1" (
    echo [INFO] Checking for updates...
    powershell -ExecutionPolicy Bypass -File "%~dp0Updater.ps1"
    exit /b
)

REM Fallback if updater not found
if not exist "%~dp0Launch.bat.ps1" (
    echo [ERROR] Launch.bat.ps1 not found!
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%~dp0Launch.bat.ps1"
