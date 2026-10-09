"""FastAPI application for F1 Synapse."""

import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.web.config import config
from src.web.jobs import job_manager
from src.web.routers import health, seasons, sessions, settings, quali

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Set the running event loop for background jobs
    job_manager.set_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title="F1 Synapse API",
    version="1.0.0",
    description="Local broadcast-quality telemetry and race replay engine API",
    lifespan=lifespan,
)

# CORS middleware for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Security: Host header validation middleware (D8)
@app.middleware("http")
async def host_validation_middleware(request: Request, call_next):
    host_header = request.headers.get("host", "")
    hostname = host_header.split(":")[0].strip().lower()
    if not hostname or hostname not in config.allowed_hosts:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "invalid_host",
                    "message": f"Host '{host_header}' is not allowed",
                    "detail": None,
                }
            },
        )
    return await call_next(request)


# Uniform error responses matching REF_API_CONTRACT.md
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        content = {
            "error": {
                "code": exc.detail.get("code", "http_error"),
                "message": exc.detail.get("message", str(exc.detail)),
                "detail": exc.detail.get("detail", None),
            }
        }
    else:
        content = {
            "error": {
                "code": "http_error",
                "message": str(exc.detail),
                "detail": None,
            }
        }
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Invalid request parameters",
                "detail": exc.errors(),
            }
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": str(exc),
                "detail": None,
            }
        },
    )


# Include Routers
app.include_router(health.router)
app.include_router(seasons.router)
app.include_router(sessions.router)
app.include_router(settings.router)
app.include_router(quali.router)

# Enable GZip compression
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Static files (serve web/dist with SPA fallback, long-lived hashed assets, no-cache index.html)
project_root = Path(__file__).resolve().parent.parent.parent
dist_dir = project_root / "web" / "dist"

if dist_dir.exists():
    fixtures_dir = dist_dir / "fixtures"
    if fixtures_dir.exists():
        app.mount("/fixtures", StaticFiles(directory=fixtures_dir), name="fixtures")

    @app.get("/assets/{asset_path:path}")
    async def serve_asset(asset_path: str):
        asset_file = dist_dir / "assets" / asset_path
        if asset_file.exists() and asset_file.is_file():
            return FileResponse(
                asset_file,
                headers={"Cache-Control": "public, max-age=31536000, immutable"},
            )
        raise HTTPException(status_code=404, detail="Asset not found")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Prevent intercepting API routes that returned 404
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        file_path = dist_dir / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400"})

        index_file = dist_dir / "index.html"
        if index_file.exists():
            return FileResponse(
                index_file,
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )
        raise HTTPException(status_code=404, detail="File not found")
else:
    @app.get("/{full_path:path}")
    async def serve_dist_missing(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        from fastapi.responses import HTMLResponse
        return HTMLResponse(
            status_code=503,
            content=(
                "<!DOCTYPE html><html><head><title>F1 Synapse - Build Required</title>"
                "<style>body{background:#090A0F;color:#F0F2F5;font-family:sans-serif;display:flex;"
                "align-items:center;justify-content:center;height:100vh;margin:0;}"
                ".card{background:#11131B;padding:2rem;border:1px solid #1F2230;border-radius:8px;"
                "max-width:500px;text-align:center;}h1{color:#E10600;margin-top:0;}code{background:#181A25;"
                "padding:0.2rem 0.5rem;border-radius:4px;color:#A855F7;}</style></head><body>"
                "<div class='card'><h1>F1 SYNAPSE</h1><p>Frontend production build not found in <code>web/dist</code>.</p>"
                "<p>Please build the web interface or use the release bundle:</p>"
                "<p><code>cd web &amp;&amp; npm run build</code></p></div></body></html>"
            ),
        )
