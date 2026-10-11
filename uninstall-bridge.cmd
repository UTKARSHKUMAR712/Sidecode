@echo off
title Sidecode — Uninstall Local Bridge
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0uninstall-bridge.ps1"
pause
