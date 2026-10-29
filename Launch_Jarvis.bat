@echo off
setlocal
cd /d "%~dp0"
set "PY="
py -3 --version >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
    echo Python 3 not found. Installing Python 3.11 for your user...
    winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
    echo.
    echo Python was installed. Close this window and double-click Launch_Jarvis.bat again.
    pause
    exit /b 1
)
%PY% jarvis_bootstrap.py %*
set "EXIT_CODE=%errorlevel%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo Jarvis did not start. Read jarvis-bootstrap.log for details.
    pause
)
exit /b %EXIT_CODE%