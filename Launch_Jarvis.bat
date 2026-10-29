@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    set "PY=py -3"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        set "PY=python"
    ) else (
        echo Python 3 not found. Installing Python 3.11 with winget...
        winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
        set "PY=py -3.11"
    )
)

%PY% jarvis_bootstrap.py %*
set "EXIT_CODE=%errorlevel%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo Jarvis did not start. Read jarvis-bootstrap.log for details.
    pause
)
exit /b %EXIT_CODE%