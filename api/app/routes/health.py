"""
LegalBridge API — health check routes.

Exposes:
    GET /health        Full health probe (verifies DB connectivity)
    GET /health/live   Liveness only (does not touch the DB) — used by Railway

Railway pings the configured health path; if /health is slow during a DB
outage we still want the container to be reported as alive, so the cheaper
/health/live exists for that purpose.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter

from ..config import get_settings
from ..database import check_database_connectivity

router = APIRouter(tags=["health"])


@router.get("/health/live", summary="Liveness probe (no DB call)")
async def liveness() -> Dict[str, Any]:
    settings = get_settings()
    return {
        "status": "alive",
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "version": settings.APP_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health", summary="Readiness probe (verifies DB)")
async def health() -> Dict[str, Any]:
    settings = get_settings()
    db_ok = await check_database_connectivity()
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "app": settings.APP_NAME,
        "env": settings.APP_ENV,
        "version": settings.APP_VERSION,
        "checks": {
            "database": "ok" if db_ok else "unreachable",
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
