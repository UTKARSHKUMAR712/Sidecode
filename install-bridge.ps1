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
    $files = @("bridge.js", "native-host.js", "native-host.cmd", "start-bridge.cmd")
    foreach ($f in $files) {
        $dest = Join-Path $InstallDir $f
        Invoke-WebRequest -Uri "$baseUrl/$f" -OutFile $dest -UseBasicParsing
    }
}

Write-Host "Bridge location: $InstallDir" -ForegroundColor Green

# 2. Check Node.js
try {
    $nodeVer = & node -v 2>$null
    Write-Host "Detected Node.js: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Node.js was not detected in PATH. Please install Node.js (https://nodejs.org) to run the bridge." -ForegroundColor Red
}

# 3. Create Native Messaging Host Manifest
$ManifestPath = Join-Path $InstallDir "com.sidecode.bridge.json"
$HostCmdPath = (Join-Path $InstallDir "native-host.cmd").Replace("\", "\\")

# Discover extension IDs from Brave, Chrome, and Edge profiles
$detectedExtIds = [System.Collections.Generic.List[string]]::new()
$detectedExtIds.Add("kmocfiinobnmaibnoblilejogcljaolc")

$searchBases = @(
    "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data",
    "$env:LOCALAPPDATA\Google\Chrome\User Data",
    "$env:LOCALAPPDATA\Microsoft\Edge\User Data"
)
foreach ($base in $searchBases) {
    if (Test-Path $base) {
        $profiles = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^(Default|Profile \d+)$" }
        foreach ($prof in $profiles) {
            foreach ($pfName in @("Preferences", "Secure Preferences")) {
                $pf = Join-Path $prof.FullName $pfName
                if (Test-Path $pf) {
                    try {
                        $txt = [System.IO.File]::ReadAllText($pf)
                        if ($txt -match "Sidecode") {
                            $matches = [regex]::Matches($txt, '"([a-p]{32})":\{[^}]*"path":"[^"]*Sidecode')
                            foreach ($m in $matches) {
                                $id = $m.Groups[1].Value
                                if (!$detectedExtIds.Contains($id)) {
                                    $detectedExtIds.Add($id)
                                }
                            }
                        }
                    } catch {}
                }
            }
        }
    }
}

$originLines = ($detectedExtIds | ForEach-Object { "    `"chrome-extension://$_/`"" }) -join ",`n"

$manifestContent = @"
{
  "name": "com.sidecode.bridge",
  "description": "Sidecode Local Native Terminal Bridge Host",
  "path": "$HostCmdPath",
  "type": "stdio",
  "allowed_origins": [
$originLines
  ]
}
"@

[System.IO.File]::WriteAllText($ManifestPath, $manifestContent, [System.Text.Encoding]::UTF8)
Write-Host "Created Native Messaging Manifest: $ManifestPath" -ForegroundColor Green

# 4. Register in Windows Registry (HKCU)
$regPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.sidecode.bridge",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.sidecode.bridge"
)

foreach ($regPath in $regPaths) {
    try {
        if (!(Test-Path $regPath)) {
            New-Item -Path $regPath -Force | Out-Null
        }
        Set-ItemProperty -Path $regPath -Name "(Default)" -Value $ManifestPath -Force | Out-Null
        $browserName = $regPath.Split("\")[2]
        Write-Host " [OK] Registered for $browserName" -ForegroundColor Green
    } catch {
        Write-Host " [SKIP] Could not register for $regPath : $_" -ForegroundColor Yellow
    }
}

# 5. Start bridge process in background if not already running
Write-Host "Checking bridge status on http://127.0.0.1:3888 ..." -ForegroundColor Cyan
$isRunning = $false
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3888/status" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($resp.ok) { $isRunning = $true }
} catch {}

if (!$isRunning) {
    Write-Host "Starting local bridge background process..." -ForegroundColor Yellow
    $bridgeScript = Join-Path $InstallDir "bridge.js"
    Start-Process -FilePath "node" -ArgumentList "`"$bridgeScript`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 1200
    try {
        $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3888/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.ok) { $isRunning = $true }
    } catch {}
}

if ($isRunning) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host " SUCCESS: Sidecode Local Bridge is active and registered!" -ForegroundColor Green
    Write-Host " Detected Compilers:" -ForegroundColor Green
    Write-Host "   GCC (C):      $(if($resp.compilers.gcc){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   G++ (C++):    $(if($resp.compilers.gpp){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Python:       $(if($resp.compilers.python){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Node.js:      $(if($resp.compilers.node){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Rust (rustc): $(if($resp.compilers.rustc){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "   Go:           $(if($resp.compilers.go){'AVAILABLE'}else{'NOT FOUND'})"
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "In Sidecode, simply select '⚡ Local PC Terminal' in the dropdown" -ForegroundColor Cyan
    Write-Host "to run code directly on your computer with real-time interactive input!" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host "Bridge registered for auto-start. You can also start it manually by running:" -ForegroundColor Yellow
    Write-Host "  node `"$InstallDir\bridge.js`"" -ForegroundColor Cyan
}
