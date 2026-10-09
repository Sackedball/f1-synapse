#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "==================================================="
echo " F1 SYNAPSE — Launching Application"
echo "==================================================="

# 1. Check Python
if ! command -v python3 &>/dev/null && ! command -v python &>/dev/null; then
    echo "Error: Python 3 is not installed or not in PATH."
    exit 1
fi
PYTHON_BIN="$(command -v python3 || command -v python)"

# 2. Setup Virtual Environment
if [ ! -f "venv/bin/python" ]; then
    echo "Creating Python virtual environment in ./venv ..."
    "$PYTHON_BIN" -m venv venv
    echo "Installing backend dependencies..."
    venv/bin/pip install --upgrade pip
    if [ -f "requirements.txt" ]; then
        venv/bin/pip install -r requirements.txt
    fi
fi

# 3. Check Web Frontend Build
if [ ! -f "web/dist/index.html" ]; then
    echo "Frontend production build not found in web/dist."
    if command -v npm &>/dev/null; then
        echo "Building frontend assets..."
        cd web
        npm install
        npm run build
        cd ..
    else
        echo "Warning: npm not found. Starting backend without prebuilt web assets."
        echo "To view the full UI, build the frontend with 'npm run build' inside web/."
    fi
fi

# 4. Start Application
echo "Starting F1 Synapse..."
exec venv/bin/python main.py "$@"
