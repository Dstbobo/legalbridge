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
from urllib.parse import urlparse, unquote

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.engine.url import URL

from .config import Settings, get_settings

logger = logging.getLogger("legalbridge.db")


# ── Base for any future ORM models ───────────────────────────────────────
class Base(DeclarativeBase):
    """Declarative base — extend this when adding SQLAlchemy models."""
    pass


# ── DSN parsing ──────────────────────────────────────────────────────────
def _parse_supabase_dsn(raw: str) -> tuple[URL, dict]:
    """
    Parse the DATABASE_URL into a SQLAlchemy URL with credentials in
    connect_args. This is necessary because Supabase Supavisor pooler
    usernames look like `postgres.<project-ref>` and URL parsers can
    mis-handle the dot in the user portion. Passing the credentials via
    connect_args bypasses every URL-parsing layer.

    Returns (url_without_credentials, connect_args_with_credentials).
    """
    # Normalise scheme to asyncpg
    dsn = raw
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://"):]

    parsed = urlparse(dsn)
    user = unquote(parsed.username) if parsed.username else None
    password = unquote(parsed.password) if parsed.password else None
    host = parsed.hostname
    port = parsed.port or 5432
    database = parsed.path.lstrip("/") or "postgres"

    # Build a credential-less URL — SQLAlchemy will use this for engine init,
    # and asyncpg receives the real user/password from connect_args.
    url = URL.create(
        drivername="postgresql+asyncpg",
        host=host,
        port=port,
        database=database,
    )

    connect_args: dict = {
        "user": user,
        "password": password,
        # asyncpg can't use libpq prepared statements through Supavisor in
        # transaction mode — disable the statement cache.
        "statement_cache_size": 0,
        # SSL is required by Supavisor for tenant authentication. Without
        # TLS the pooler downgrades SCRAM and strips the project-ref suffix
        # from the username, producing `password authentication failed for
        # user "postgres"`.
        "ssl": "require",
    }
    return url, connect_args


# ── Engine + session factory (module-level singletons) ───────────────────
_settings: Settings = get_settings()
_url, _connect_args = _parse_supabase_dsn(_settings.DATABASE_URL)

logger.info(
    "Initialising DB engine: host=%s port=%s db=%s user=%s ssl=require",
    _url.host, _url.port, _url.database, _connect_args.get("user"),
)

engine: AsyncEngine = create_async_engine(
    _url,
    echo=_settings.DB_ECHO_SQL,
    pool_size=_settings.DB_POOL_SIZE,
    max_overflow=_settings.DB_MAX_OVERFLOW,
    pool_timeout=_settings.DB_POOL_TIMEOUT_SECONDS,
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args=_connect_args,
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
