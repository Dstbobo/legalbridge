"""
LegalBridge API — FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Railway uses the Dockerfile in /api; CMD launches uvicorn against this app.
"""
from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Awaitable, Callable, Dict

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import check_database_connectivity, dispose_engine
from .routes import documents, health


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


# ── CORS ────────────────────────────────────────────────────────────────
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
    expose_headers=["Content-Type", "X-Stream", "X-Intent", "X-Source", "X-Request-ID"],
    max_age=600,
)


# ── Request logging middleware ──────────────────────────────────────────
@app.middleware("http")
async def request_logger(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """
    Attach an X-Request-ID, time each request, and log method/path/status/
    duration. Skips noisy health probes so the logs stay readable.
    """
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    quiet = request.url.path in ("/health", "/health/live")
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "rid=%s %s %s -> EXC %.1fms",
            rid, request.method, request.url.path, duration_ms,
        )
        raise
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = rid
    if not quiet:
        logger.info(
            "rid=%s %s %s -> %d %.1fms",
            rid, request.method, request.url.path, response.status_code, duration_ms,
        )
    return response


# ── Routers ────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(documents.router)


# ── Root ───────────────────────────────────────────────────────────────
@app.get("/", tags=["root"])
async def root() -> Dict[str, Any]:
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "env": settings.APP_ENV,
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "documents": "/v1/documents",
        },
    }


# ── Generic exception handler so failures are JSON, not HTML ───────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error", "detail": "Something went wrong."},
    )
