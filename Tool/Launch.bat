@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================================
echo   Pokerogue Pokemon Creator
echo ================================================
echo.

REM Check if python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    python3 --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Python not found. Please install Python.
        echo Download from: https://python.org
        pause
        exit /b 1
    )
    set PYCMD=python3
) else (
    set PYCMD=python
)

REM Kill any existing server on port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting local server at http://localhost:8080
echo Press Ctrl+C to stop the server.
echo.

REM Start server and open browser
start "" cmd /c "%PYCMD% -m http.server 8080 & timeout /t 2 >nul & start http://localhost:8080"
%PYCMD% -m http.server 8080
