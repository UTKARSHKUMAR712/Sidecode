@echo off
title Sidecode — Install Local Bridge
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0install-bridge.ps1"
pause
