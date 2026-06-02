"""
LegalBridge API — application settings.

All configuration is read from environment variables (Railway → Variables tab).
Local development can use a `.env` file in the /api folder.
"""
from functools import lru_cache
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ── App identity ──────────────────────────────────────────────
    APP_NAME: str = "LegalBridge API"
    APP_ENV: str = Field(default="production", description="production | staging | local")
    APP_VERSION: str = "1.1.0"
    LOG_LEVEL: str = "info"

    # ── Supabase ──────────────────────────────────────────────────
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_ANON_KEY: str

    # ── Database (Supabase Postgres) ──────────────────────────────
    DATABASE_URL: str
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_ECHO_SQL: bool = False

    # ── CORS ──────────────────────────────────────────────────────
    CORS_ALLOWED_ORIGINS: str = "https://legalbridge.ng,https://www.legalbridge.ng"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]

    # ── JWT verification options ─────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    JWT_AUDIENCE: str = "authenticated"
    JWT_LEEWAY_SECONDS: int = 5

    # ── External AI providers (Phase 2 — /v1/documents) ───────────
    # Anthropic Claude for document drafting (mirrors chat-documents EF).
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"
    ANTHROPIC_MAX_TOKENS: int = 8192
    ANTHROPIC_TEMPERATURE: float = 0.2
    ANTHROPIC_API_URL: str = "https://api.anthropic.com/v1/messages"
    ANTHROPIC_VERSION: str = "2023-06-01"

    # Voyage AI embeddings — used to rank document_templates when the
    # alias map doesn't match. voyage-law-2 is their legal-domain model.
    VOYAGE_API_KEY: Optional[str] = None
    VOYAGE_MODEL: str = "voyage-law-2"
    VOYAGE_API_URL: str = "https://api.voyageai.com/v1/embeddings"
    # Cosine-distance threshold below which we accept a semantic match.
    # 1 - cosine(similarity); 0.30 ≈ ~0.70 similarity. Conservative on purpose.
    VOYAGE_MATCH_MAX_DISTANCE: float = 0.30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached singleton — Settings is immutable for the process lifetime."""
    return Settings()  # type: ignore[call-arg]
