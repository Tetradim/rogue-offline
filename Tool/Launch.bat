@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Pokerogue Pokemon Creator - Launcher v1.1
echo ================================================
echo.

if not exist "%~dp0Launch.bat.ps1" (
    echo [ERROR] Launch.bat.ps1 not found!
    echo Please ensure all files are extracted together.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -File "%~dp0Launch.bat.ps1"
