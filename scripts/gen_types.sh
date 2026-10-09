#!/usr/bin/env bash
set -e

PY="python"
if [ -f "venv/bin/python" ]; then
    PY="venv/bin/python"
elif [ -f "venv/Scripts/python.exe" ]; then
    PY="venv/Scripts/python.exe"
elif [ -f ".venv/bin/python" ]; then
    PY=".venv/bin/python"
elif [ -f ".venv/Scripts/python.exe" ]; then
    PY=".venv/Scripts/python.exe"
fi

echo "Dumping OpenAPI schema from FastAPI app using $PY..."
$PY -c "import json; from src.web.app import app; json.dump(app.openapi(), open('web/openapi.json', 'w'), indent=2)"

if [ ! -f "web/openapi.json" ]; then
    echo "Failed to generate web/openapi.json"
    exit 1
fi

mkdir -p web/src/api

echo "Generating TypeScript types with openapi-typescript..."
npx --yes openapi-typescript web/openapi.json -o web/src/api/types.gen.ts

echo "Successfully generated web/src/api/types.gen.ts"
