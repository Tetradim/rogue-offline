@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title PokeRogue Mod Studio - Offline Launcher

echo ================================================
echo   PokeRogue Mod Studio - No Update Launcher
echo ================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js 20 or newer is required.
    echo         Download it from https://nodejs.org/
    goto :failure
)

node.exe -e "const major=Number(process.versions.node.split('.')[0]);process.exit(major>=20?0:1)"
if errorlevel 1 (
    echo [ERROR] Node.js 20 or newer is required.
    goto :failure
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found next to Node.js.
    goto :failure
)

set "LOCK_HASH="
for /f "usebackq delims=" %%H in (`powershell.exe -NoProfile -Command "if (Test-Path -LiteralPath 'package-lock.json') { (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash }"`) do set "LOCK_HASH=%%H"

set "SAVED_HASH="
if exist ".launcher-deps.sha256" set /p "SAVED_HASH="<".launcher-deps.sha256"

set "INSTALL_DEPS=0"
if not exist "node_modules\" set "INSTALL_DEPS=1"
if not defined LOCK_HASH set "INSTALL_DEPS=1"
if defined LOCK_HASH if /i not "!LOCK_HASH!"=="!SAVED_HASH!" set "INSTALL_DEPS=1"

if "!INSTALL_DEPS!"=="1" (
    echo [SETUP] Synchronizing local dependencies...
    call npm.cmd ci --no-audit --no-fund
    if errorlevel 1 goto :failure
    if defined LOCK_HASH >".launcher-deps.sha256" echo !LOCK_HASH!
) else (
    echo [SETUP] Dependencies match package-lock.json.
)

echo [BUILD] Creating the local application bundle...
call npm.cmd run build
if errorlevel 1 goto :failure

echo [START] Opening the local studio. Close this window to stop it.
node.exe server\index.js --open
set "EXIT_CODE=!errorlevel!"
if not "!EXIT_CODE!"=="0" goto :failureWithCode
exit /b 0

:failure
set "EXIT_CODE=1"

:failureWithCode
echo.
echo [ERROR] The launcher stopped with exit code !EXIT_CODE!.
pause
exit /b !EXIT_CODE!
