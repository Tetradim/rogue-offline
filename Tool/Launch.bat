# Pokerogue Pokemon Creator Launcher
# Serves this folder over local HTTP so ES module scripts can load.
powershell -ExecutionPolicy Bypass -File "$PSCommandPath.ps1"
exit /b %errorlevel%