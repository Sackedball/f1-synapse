# scripts/gen_types.ps1
$ErrorActionPreference = "Stop"

$py = "python"
if (Test-Path "venv/Scripts/python.exe") {
    $py = "venv/Scripts/python.exe"
} elseif (Test-Path ".venv/Scripts/python.exe") {
    $py = ".venv/Scripts/python.exe"
}

Write-Host "Dumping OpenAPI schema from FastAPI app using $py..."
& $py -c "import json; from src.web.app import app; json.dump(app.openapi(), open('web/openapi.json', 'w'), indent=2)"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to dump OpenAPI schema"
    exit 1
}

if (!(Test-Path "web/openapi.json")) {
    Write-Error "Failed to generate web/openapi.json"
    exit 1
}

New-Item -ItemType Directory -Force -Path "web/src/api" | Out-Null

Write-Host "Generating TypeScript types with openapi-typescript..."
npx --yes openapi-typescript web/openapi.json -o web/src/api/types.gen.ts
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to generate TypeScript types"
    exit 1
}

Write-Host "Successfully generated web/src/api/types.gen.ts"
