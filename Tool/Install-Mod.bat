@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag a PokéRogue Mod Studio manifest or package onto this BAT, or run:
  echo   Install-Mod.bat my-mod.pokerogue-mod-package.json C:\path\to\rogue-offline
  pause
  exit /b 1
)
if "%~2"=="" (
  set /p GAME_ROOT=Enter the full path to your rogue-offline folder:
) else (
  set "GAME_ROOT=%~2"
)
echo.
echo Running safety preflight...
node pokerogue-mod-package-installer.cjs --input "%~1" --project "%GAME_ROOT%" --dry-run || goto :failed
echo.
choice /M "Preflight passed. Apply this mod"
if errorlevel 2 exit /b 0
node pokerogue-mod-package-installer.cjs --input "%~1" --project "%GAME_ROOT%" || goto :failed
echo.
echo Installation complete. Rebuild and launch PokéRogue.
pause
exit /b 0
:failed
echo.
echo Installation stopped. No partial changes should remain.
pause
exit /b 1
