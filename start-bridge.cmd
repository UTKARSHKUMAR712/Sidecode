@echo off
title Sidecode Local Native Bridge
cd /d "%~dp0"
echo ======================================================================
echo   Sidecode Local Native Terminal Bridge
echo   Connecting your browser directly to your local PC compilers:
echo   MSYS2 GCC, Clang, Python, Node.js, Rust, Go
echo ======================================================================
echo.
echo Starting bridge server on http://127.0.0.1:3888 ...
echo Press Ctrl+C in this window anytime to stop.
echo.
node bridge.js
pause
