"""
Shared pytest fixtures.

We need real environment variables loaded BEFORE importing `app.config`
because pydantic-settings reads from os.environ at class-instantiation
time. Tests set the minimum dummy values so the Settings model can
validate, then everything else can be overridden per-test.
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path

import jwt
import pytest

# Make `api/app/...` importable when pytest is run from anywhere.
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


_DEFAULT_TEST_ENV = {
    "APP_ENV": "test",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_JWT_SECRET": "test-secret-do-not-use-in-prod" * 2,
    "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
    "SUPABASE_ANON_KEY": "test-anon-key",
    # asyncpg DSN — pointed nowhere; tests that need DB will mock the engine.
    "DATABASE_URL": "postgresql://test:test@127.0.0.1:5432/test",
    "ANTHROPIC_API_KEY": "test-anthropic-key",
    "VOYAGE_API_KEY": "test-voyage-key",
    "CORS_ALLOWED_ORIGINS": "https://legalbridge.ng",
}

for k, v in _DEFAULT_TEST_ENV.items():
    # Use setdefault semantics but overwrite empty strings too, since pydantic
    # treats an empty env var as "set to ''" not "missing", which breaks our
    # Optional[str] config validation.
    if not os.environ.get(k):
        os.environ[k] = v


@pytest.fixture
def settings():
    """Fresh Settings instance for tests that want to override env."""
    from app.config import Settings  # noqa: WPS433 — late import after env is set
    return Settings()  # type: ignore[call-arg]


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """A short-lived, correctly signed Supabase end-user access token."""
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": str(uuid.uuid4()),
            "email": "buyer-readiness@example.test",
            "role": "authenticated",
            "aud": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        _DEFAULT_TEST_ENV["SUPABASE_JWT_SECRET"],
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
