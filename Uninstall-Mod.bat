@echo off
setlocal
cd /d "%~dp0"
set /p GAME_ROOT=Enter the full path to your rogue-offline folder: 
set /p MOD_ID=Enter the mod ID shown in the manifest (default local-custom-species): 
if "%MOD_ID%"=="" set MOD_ID=local_custom_species
node pokerogue-mod-installer.cjs --project "%GAME_ROOT%" --uninstall "%MOD_ID%"
pause
