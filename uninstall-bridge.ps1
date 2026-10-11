# Sidecode Local Bridge — 1-Click Uninstaller for PowerShell
# Can be executed locally or fetched directly:
#   irm https://raw.githubusercontent.com/UTKARSHKUMAR712/Sidecode/main/uninstall-bridge.ps1 | iex

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "   Sidecode Local Native Terminal Bridge Uninstaller" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Stop any running bridge process
Write-Host "Stopping running Sidecode Bridge processes..." -ForegroundColor Cyan

# Graceful HTTP shutdown first
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:3888/shutdown" -TimeoutSec 1 -ErrorAction SilentlyContinue | Out-Null
} catch {}

# Force terminate any remaining process on port 3888
try {
    $connections = Get-NetTCPConnection -LocalPort 3888 -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    $netstat = netstat -ano | Select-String "127.0.0.1:3888" | Select-String "LISTENING"
    if ($netstat) {
        $pidStr = ($netstat -split '\s+')[-1]
        if ($pidStr -and $pidStr -match '^\d+$') {
            taskkill /F /PID $pidStr | Out-Null
        }
    }
}

# Also stop any node process running bridge.js
try {
    Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%bridge.js%'" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
} catch {}

Write-Host " [OK] Bridge processes stopped." -ForegroundColor Green

# 2. Unregister Native Messaging from Windows Registry (HKCU)
Write-Host "Unregistering Chrome, Brave, and Edge Native Messaging hosts..." -ForegroundColor Cyan

$regPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.sidecode.bridge"
)

foreach ($regPath in $regPaths) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
        $browserName = $regPath.Split("\")[2]
        Write-Host " [OK] Removed registry entry for $browserName" -ForegroundColor Green
    }
}

# 3. Clean up generated bridge files and helper scripts
$possibleDirs = @(
    $PSScriptRoot,
    "$HOME\OneDrive\Desktop\projects\extensions\Sidecode",
    "$HOME\.sidecode-bridge"
)

$filesToClean = @(
    "com.sidecode.bridge.json",
    "start-bridge-silent.vbs",
    "run-bridge-hidden.vbs",
    "_sidecode_unbuffer.h"
)

foreach ($dir in $possibleDirs) {
    if ($dir -and (Test-Path $dir)) {
        foreach ($f in $filesToClean) {
            $target = Join-Path $dir $f
            if (Test-Path $target) {
                Remove-Item -Path $target -Force -ErrorAction SilentlyContinue
                Write-Host " [OK] Removed $target" -ForegroundColor Green
            }
        }
    }
}

# If standalone ~/.sidecode-bridge was downloaded, remove it
$standaloneDir = Join-Path $HOME ".sidecode-bridge"
if (Test-Path $standaloneDir) {
    Remove-Item -Path $standaloneDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host " [OK] Removed standalone directory: $standaloneDir" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " SUCCESS: Sidecode Local Bridge has been fully uninstalled!" -ForegroundColor Green
Write-Host " All browser registrations and background services removed." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
