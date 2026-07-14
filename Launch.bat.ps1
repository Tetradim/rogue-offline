$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host 'PokéRogue Mod Studio' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] Node.js 20 or newer is required.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

node -e "const major = Number(process.versions.node.split('.')[0]); process.exit(major >= 20 ? 0 : 1)"
if ($LASTEXITCODE -ne 0) {
    Write-Host '[ERROR] Node.js 20 or newer is required.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

if (-not (Test-Path 'node_modules')) {
    Write-Host '[SETUP] Installing local dependencies...'
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host '[BUILD] Creating the local application bundle...'
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '[START] Opening the local studio. Close this window to stop it.' -ForegroundColor Green
node server\index.js --open
exit $LASTEXITCODE
