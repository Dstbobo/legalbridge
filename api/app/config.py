"""
LegalBridge API — application settings.

All configuration is read from environment variables (Railway → Variables tab).
Local development can use a `.env` file in the /api folder.
"""
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── App identity ──────────────────────────────────────────────
    APP_NAME: str = "LegalBridge API"
    APP_ENV: str = Field(default="production", description="production | staging | local")
    APP_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "info"

    # ── Supabase ──────────────────────────────────────────────────
    # Project URL, e.g. https://qcutjnsxiawnejiqwwix.supabase.co
    SUPABASE_URL: str
    # The JWT signing secret (Project Settings → API → JWT Secret).
    # This is DIFFERENT from anon / service-role keys — it is the HS256 secret
    # Supabase uses to sign every auth token. Required to verify those tokens.
    SUPABASE_JWT_SECRET: str
    # Service role key — used for any REST calls that bypass RLS.
    SUPABASE_SERVICE_ROLE_KEY: str
    # Anon key — safe for use when proxying client-style requests.
    SUPABASE_ANON_KEY: str

    # ── Database (Supabase Postgres) ──────────────────────────────
    # Full async DSN. Supabase shows it as:
    #   postgresql://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres
    # We rewrite to asyncpg driver at runtime in database.py.
    DATABASE_URL: str
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_ECHO_SQL: bool = False

    # ── CORS ──────────────────────────────────────────────────────
    # Comma-separated list of allowed origins.
    # Example value on Railway:
    #   https://legalbridge.ng,https://www.legalbridge.ng
    CORS_ALLOWED_ORIGINS: str = "https://legalbridge.ng,https://www.legalbridge.ng"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]

    # ── JWT verification options ─────────────────────────────────
    # Supabase tokens use HS256. The 'aud' claim is "authenticated" for
    # logged-in users; we expect this audience by default.
    JWT_ALGORITHM: str = "HS256"
    JWT_AUDIENCE: str = "authenticated"
    JWT_LEEWAY_SECONDS: int = 5  # tolerate small clock drift between Railway + Supabase

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton — Settings is immutable for the process lifetime."""
    return Settings()  # type: ignore[call-arg]
