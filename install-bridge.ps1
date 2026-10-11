# Sidecode Local Bridge — 1-Click Installer for PowerShell
# Can be executed locally or fetched directly:
#   irm https://raw.githubusercontent.com/UTKARSHKUMAR712/Sidecode/main/install-bridge.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Sidecode Local Native Terminal Bridge Installer" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Determine installation directory
$InstallDir = $null

if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "bridge.js"))) {
    $InstallDir = $PSScriptRoot
} elseif (Test-Path "$HOME\OneDrive\Desktop\projects\extensions\Sidecode\bridge.js") {
    $InstallDir = "$HOME\OneDrive\Desktop\projects\extensions\Sidecode"
} else {
    $InstallDir = Join-Path $HOME ".sidecode-bridge"
    if (!(Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    Write-Host "Fetching latest bridge files from GitHub into $InstallDir..." -ForegroundColor Yellow
    $baseUrl = "https://raw.githubusercontent.com/UTKARSHKUMAR712/Sidecode/main"
    $files = @("bridge.js", "package.json", "start-bridge.cmd")
    foreach ($f in $files) {
        $dest = Join-Path $InstallDir $f
        Invoke-WebRequest -Uri "$baseUrl/$f" -OutFile $dest -UseBasicParsing
    }
}

$pkgJson = Join-Path $InstallDir "package.json"
if (!(Test-Path $pkgJson)) {
    Set-Content -Path $pkgJson -Value '{"type":"module"}' -Encoding ASCII
}

Write-Host "Bridge location: $InstallDir" -ForegroundColor Green

# 2. Check Node.js
try {
    $nodeVer = & node -v 2>$null
    Write-Host "Detected Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Node.js was not detected in PATH. Please install Node.js (https://nodejs.org) to run the bridge." -ForegroundColor Red
}

# 3. Clean up any legacy native messaging registry keys to prevent CMD window popups
$regPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.sidecode.bridge"
)
foreach ($regPath in $regPaths) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 4. Stop any previous bridge instances cleanly
Write-Host "Checking for existing bridge instances on http://127.0.0.1:3888 ..." -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:3888/shutdown" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Milliseconds 400
} catch {}

try {
    $connections = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
} catch {}

# 5. Create silent launcher VBScript (runs 100% hidden with zero console window popup)
$bridgeScript = Join-Path $InstallDir "bridge.js"
$vbsPath = Join-Path $InstallDir "start-bridge-silent.vbs"
$vbsContent = @"
Dim fso, currentDir, shell
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = currentDir
shell.Run "node bridge.js", 0, False
"@
[System.IO.File]::WriteAllText($vbsPath, $vbsContent, [System.Text.Encoding]::ASCII)

Write-Host "Starting local bridge background service..." -ForegroundColor Yellow
Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $InstallDir
Start-Sleep -Milliseconds 1500

$isRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3888/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($resp.ok) { $isRunning = $true }
} catch {}

if ($isRunning) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " SUCCESS: Sidecode Local Bridge is active and running!" -ForegroundColor Green
    Write-Host " Detected Compilers:" -ForegroundColor Green
    Write-Host "   GCC (C):      $(if($resp.compilers.gcc){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   G++ (C++):    $(if($resp.compilers.gpp){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Python:       $(if($resp.compilers.python){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Node.js:      $(if($resp.compilers.node){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Rust (rustc): $(if($resp.compilers.rustc){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Go:           $(if($resp.compilers.go){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "In Sidecode, select '⚡ Local PC Terminal' in the dropdown" -ForegroundColor Cyan
    Write-Host "to run code directly on your computer with real-time interactive input!" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "Starting via hidden process fallback..." -ForegroundColor Yellow
    Start-Process -FilePath "node" -ArgumentList "`"$bridgeScript`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 1200
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3888/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.ok) {
            Write-Host "SUCCESS: Bridge is running on http://127.0.0.1:3888!" -ForegroundColor Green
        }
    } catch {
        Write-Host "Bridge could not be reached. You can start it manually by running:" -ForegroundColor Yellow
        Write-Host "  node `"$InstallDir\bridge.js`"" -ForegroundColor Cyan
    }
}
