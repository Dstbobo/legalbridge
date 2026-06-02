"""
LegalBridge API — async PostgreSQL connection (SQLAlchemy 2.0 + asyncpg).

This module owns the engine and session lifecycle. Routes get a session via
the `get_db` dependency:

    from app.database import get_db
    from sqlalchemy.ext.asyncio import AsyncSession

    @router.get("/foo")
    async def foo(db: AsyncSession = Depends(get_db)):
        result = await db.execute(text("SELECT 1"))
        return {"ok": result.scalar() == 1}

NOTE: this connects to the SAME Postgres instance Supabase uses. Schema
migrations remain owned by Supabase (we don't run Alembic from here in
Phase 1). Tables `profiles`, `chats`, `messages`, `generated_documents`,
`document_templates`, `conversations`, `direct_messages`, `mentorship_requests`
are already in place and managed by the Edge Function side.
"""
from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import Settings, get_settings

logger = logging.getLogger("legalbridge.db")


# ── Base for any future ORM models ───────────────────────────────────────
class Base(DeclarativeBase):
    """Declarative base — extend this when adding SQLAlchemy models."""
    pass


# ── DSN normalisation ────────────────────────────────────────────────────
def _to_async_dsn(raw: str) -> str:
    """
    Supabase shows DSNs as `postgresql://...`. SQLAlchemy needs the explicit
    `postgresql+asyncpg://` driver prefix to pick the async driver.
    """
    if raw.startswith("postgres://"):  # legacy alias
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://") and "+asyncpg" not in raw:
        return "postgresql+asyncpg://" + raw[len("postgresql://"):]
    return raw


# ── Engine + session factory (module-level singletons) ───────────────────
_settings: Settings = get_settings()
_async_dsn: str = _to_async_dsn(_settings.DATABASE_URL)

engine: AsyncEngine = create_async_engine(
    _async_dsn,
    echo=_settings.DB_ECHO_SQL,
    pool_size=_settings.DB_POOL_SIZE,
    max_overflow=_settings.DB_MAX_OVERFLOW,
    pool_timeout=_settings.DB_POOL_TIMEOUT_SECONDS,
    pool_pre_ping=True,
    # Render-friendly: do not keep stale connections beyond 30 min.
    pool_recycle=1800,
    # asyncpg can't use libpq prepared statements when going through
    # PgBouncer/Supavisor in transaction mode. Setting statement cache size
    # to 0 keeps things safe regardless of which Supabase pooler is in play.
    #
    # SSL is REQUIRED when connecting to Supabase's Supavisor pooler with
    # the `postgres.<project-ref>` tenant username. Without TLS the pooler
    # downgrades the SCRAM exchange and strips the tenant suffix, producing
    # `password authentication failed for user "postgres"`.
    connect_args={
        "statement_cache_size": 0,
        "ssl": "require",
    },
)


SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── FastAPI dependency ───────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield a transactional async session. The context manager ensures
    proper closing/rollback even when the route raises.
    """
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# ── Lifespan helpers ─────────────────────────────────────────────────────
async def check_database_connectivity() -> bool:
    """
    Lightweight `SELECT 1` against the database. Used by the health check.
    Returns True if reachable, False otherwise (does NOT raise).
    """
    from sqlalchemy import text
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            return result.scalar() == 1
    except Exception as exc:
        logger.warning("Database connectivity check failed: %s", exc)
        return False


async def dispose_engine() -> None:
    """Tear down the connection pool — called on application shutdown."""
    await engine.dispose()


__all__ = [
    "Base",
    "engine",
    "SessionLocal",
    "get_db",
    "check_database_connectivity",
    "dispose_engine",
]
