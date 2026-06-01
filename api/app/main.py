"""
LegalBridge API — FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Railway uses the Dockerfile in /api; CMD launches uvicorn against this app.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import check_database_connectivity, dispose_engine
from .routes import health


logger = logging.getLogger("legalbridge.api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s %(message)s")


# ── Lifespan: probe DB on startup, dispose engine on shutdown ──────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info(
        "Starting %s v%s in env=%s",
        settings.APP_NAME, settings.APP_VERSION, settings.APP_ENV,
    )
    db_ok = await check_database_connectivity()
    if db_ok:
        logger.info("Database connectivity: OK")
    else:
        # Do NOT crash on a bad DB at boot — Railway will report unhealthy
        # via /health and we can investigate without losing the container.
        logger.warning("Database connectivity: UNREACHABLE at startup")
    yield
    logger.info("Shutting down — disposing DB engine")
    await dispose_engine()


# ── FastAPI app ────────────────────────────────────────────────────────
settings = get_settings()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "LegalBridge backend API. Runs alongside the Supabase Edge Functions "
        "(chat-stream, chat-tools, chat-documents). Authenticates the same "
        "Supabase JWTs the frontend already issues."
    ),
    docs_url="/docs",
    redoc_url=None,
    openapi_url="/openapi.json",
    lifespan=lifespan,
)


# ── CORS — only the configured origins for legalbridge.ng ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "X-Requested-With",
        "X-Client-Info",
        "apikey",
    ],
    expose_headers=["Content-Type", "X-Stream", "X-Intent"],
    max_age=600,
)


# ── Routers ────────────────────────────────────────────────────────────
app.include_router(health.router)


# ── Root ───────────────────────────────────────────────────────────────
@app.get("/", tags=["root"])
async def root() -> Dict[str, Any]:
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env": settings.APP_ENV,
        "docs": "/docs",
        "health": "/health",
    }


# ── Generic exception handler so failures are JSON, not HTML ───────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": "Something went wrong."},
    )
