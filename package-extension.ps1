# Sidecode Extension Packager for GitHub Releases
param (
    [string]$Version = "2.0.0"
)

$distDir = "$PSScriptRoot\dist"
$stageDir = "$distDir\Sidecode"
$zipPath = "$distDir\Sidecode-v$Version.zip"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   Packaging Sidecode Extension v$Version for GitHub Release" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (Test-Path $distDir) {
    Remove-Item -Path $distDir -Recurse -Force
}

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

$itemsToInclude = @(
    "manifest.json",
    "background.js",
    "bridge.js",
    "native-host.cmd",
    "native-host.js",
    "install-bridge.cmd",
    "install-bridge.ps1",
    "uninstall-bridge.cmd",
    "uninstall-bridge.ps1",
    "start-bridge.cmd",
    "start-bridge-silent.vbs",
    "package.json",
    "README.md",
    "icons",
    "sidepanel",
    "debug"
)

foreach ($item in $itemsToInclude) {
    $src = "$PSScriptRoot\$item"
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $stageDir -Recurse -Force
    }
}

Write-Host "Compressing extension into $zipPath ..." -ForegroundColor Yellow
Compress-Archive -Path "$stageDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

$zipSizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " SUCCESS: Sidecode-v$Version.zip created successfully!" -ForegroundColor Green
Write-Host " Size: $zipSizeMB MB" -ForegroundColor Green
Write-Host " Location: $zipPath" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
