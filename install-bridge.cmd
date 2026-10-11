@echo off
title Sidecode — Install Local Bridge Auto-Start
cd /d "%~dp0"
echo ======================================================================
echo   Sidecode Local Bridge — 1-Click Auto-Start Installer
echo ======================================================================
echo.

set HOST_PATH=%~dp0native-host.cmd
set HOST_PATH=%HOST_PATH:\=\\%
set MANIFEST_PATH=%~dp0com.sidecode.bridge.json

echo Generating Native Messaging manifest: %MANIFEST_PATH%
(
echo {
echo   "name": "com.sidecode.bridge",
echo   "description": "Sidecode Local Native Terminal Bridge Host",
echo   "path": "%HOST_PATH%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://kmocfiinobnmaibnoblilejogcljaolc/",
echo     "chrome-extension://*/*"
echo   ]
echo }
) > "%MANIFEST_PATH%"

echo Registering Native Messaging Host in Windows Registry (HKCU)...

reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.sidecode.bridge" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel% equ 0 (
  echo  [OK] Registered for Google Chrome
) else (
  echo  [WARN] Failed to register for Google Chrome
)

reg add "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.sidecode.bridge" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel% equ 0 (
  echo  [OK] Registered for Brave Browser
) else (
  echo  [WARN] Failed to register for Brave Browser
)

reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.sidecode.bridge" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul 2>&1
if %errorlevel% equ 0 (
  echo  [OK] Registered for Microsoft Edge
) else (
  echo  [WARN] Failed to register for Microsoft Edge
)

echo.
echo ======================================================================
echo   SUCCESS! Sidecode Local Bridge is registered.
echo   When you select "⚡ Local PC Terminal" in Sidecode, Chrome/Brave
echo   will automatically start the bridge in the background!
echo ======================================================================
echo.
pause
