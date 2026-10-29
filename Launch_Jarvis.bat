@echo off
setlocal
cd /d "%~dp0"

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)

if not defined PY (
  echo Python nahi mila. Winget se Python 3.11 install ho raha hai...
  winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python install ho gaya. Ab yeh window band karke Launch_Jarvis.bat dobara chalaiye.
  pause
  exit /b 1
)

%PY% jarvis_bootstrap.py
if errorlevel 1 (
  echo.
  echo Jarvis start nahi hua. Upar wala error dekhiye.
  pause
)
endlocal