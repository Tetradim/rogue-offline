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
}

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
    Write-Host "[ERROR] Could not find a free port (5173-5192)" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "================================================"
Write-Host "  Pokerogue Pokemon Creator"
Write-Host "================================================"
Write-Host "[OK] http://localhost:$port/"
Write-Host ""

Start-Process "http://localhost:$port/"

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Pokerogue.url"
"@([InternetShortcut]`nURL=http://localhost:$port/)" | Out-File $shortcutPath -Encoding UTF8

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        $localPath = $context.Request.Url.LocalPath.TrimStart("/")
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
            $response.OutputStream.Close()
        }
        $response.OutputStream.Close()
    }
} finally {
    $listener.Stop()
    $listener.Close()
}