@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo  F1 SYNAPSE — Launching Application
echo ===================================================

cd /d "%~dp0"

REM 1. Check Python
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: Python is not installed or not in PATH.
    echo Please install Python 3.10+ and try again.
    pause
    exit /b 1
)

REM 2. Setup Virtual Environment
if not exist "venv\Scripts\python.exe" (
    echo Creating Python virtual environment in .\venv ...
    python -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo Installing backend dependencies...
    venv\Scripts\python.exe -m pip install --upgrade pip
    if exist "requirements.txt" (
        venv\Scripts\python.exe -m pip install -r requirements.txt
    )
)

REM 3. Check Web Frontend Build
if not exist "web\dist\index.html" (
    echo Frontend production build not found in web\dist.
    echo Checking Node.js / npm...
    where npm >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo Building frontend assets...
        cd web
        call npm install
        call npm run build
        cd ..
    ) else (
        echo Warning: npm not found. Starting backend without prebuilt web assets.
        echo To view the full UI, build the frontend with 'npm run build' inside web\.
    )
)

REM 4. Start Application
echo Starting F1 Synapse...
venv\Scripts\python.exe main.py %*
