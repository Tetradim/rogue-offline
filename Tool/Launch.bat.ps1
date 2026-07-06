# Pokerogue Pokemon Creator Launcher
# Serves this folder over local HTTP so ES module scripts can load.
# (Opening index.html directly via file:// blocks module scripts due to CORS)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$mimeMap = @{
    ".html" = "text/html"
    ".js"   = "application/javascript"
    ".css"  = "text/css"
    ".json" = "application/json"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
}

# Find a free port
$port = 5173
$listener = $null
for ($i = 0; $i -lt 20; $i++) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        break
    } catch {
        $listener = $null
        $port++
    }
}

if (-not $listener) {
    Write-Host "[ERROR] Could not find a free port to start the local server." -ForegroundColor Red
    Write-Host ""
    Write-Host "--- COPY FOR SUPPORT ---"
    Write-Host "ERROR: No free port found (tried 5173-5192)"
    Write-Host "DATE: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    Write-Host "USER: $env:USERNAME"
    Write-Host "COMPUTER: $env:COMPUTERNAME"
    Write-Host "------------------------"
    pause
    exit 1
}

Write-Host "================================================"
Write-Host "  Pokerogue Pokemon Creator - Local Server"
Write-Host "================================================"
Write-Host ""
Write-Host "[OK] Serving: $scriptDir"
Write-Host "[OK] URL: http://localhost:$port/"
Write-Host ""
Write-Host "Opening in your default browser..."
Write-Host "(Close this window to stop the server)"
Write-Host ""

# Create desktop shortcut
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Pokerogue Pokemon Creator.url"
$urlContent = @"
[InternetShortcut]
URL=http://localhost:$port/index.html
"@
try {
    $urlContent | Out-File -FilePath $shortcutPath -Encoding UTF8 -Force
    Write-Host "[OK] Desktop shortcut created"
} catch {
    Write-Host "[WARN] Could not create shortcut: $_"
}

Start-Process "http://localhost:$port/index.html"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath.TrimStart("/")
        if ([string]::IsNullOrEmpty($localPath)) { $localPath = "index.html" }
        $filePath = Join-Path $scriptDir $localPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath)
            $mime = $mimeMap[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}