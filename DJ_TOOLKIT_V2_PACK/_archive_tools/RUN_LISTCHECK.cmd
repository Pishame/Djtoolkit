@echo off
set "SCRIPT_DIR=%~dp0"
set "SCRIPT=%SCRIPT_DIR%DJ_LISTCHECK.ps1"

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
) else (
    powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
)
pause
