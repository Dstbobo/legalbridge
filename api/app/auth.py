"""
LegalBridge API — Supabase JWT authentication.

The frontend already authenticates users via Supabase Auth. Every authenticated
request from the browser carries a JWT in the `Authorization: Bearer <token>`
header. This module verifies that JWT using the project's HS256 secret and
returns a typed `AuthenticatedUser` object that FastAPI routes can depend on.

Usage in a route:

    from fastapi import Depends
    from app.auth import AuthenticatedUser, require_user

    @router.get("/me")
    async def me(user: AuthenticatedUser = Depends(require_user)):
        return {"id": user.id, "email": user.email}

For routes that should work either authenticated or anonymously, use
`optional_user` instead.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, get_settings


# `auto_error=False` lets us return our own 401 (rather than HTTPBearer's
# default) and also lets optional_user gracefully accept anonymous requests.
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    """Minimal user payload extracted from a verified Supabase JWT."""
    id: str                       # auth.users.id (UUID)
    email: Optional[str]
    role: str                     # Supabase role claim ("authenticated", "service_role", etc.)
    aud: str                      # JWT audience — should be "authenticated"
    raw_claims: Dict[str, Any]    # full decoded payload for advanced uses


# ── Internal helpers ─────────────────────────────────────────────────────

def _decode_token(token: str, settings: Settings) -> Dict[str, Any]:
    """
    Verify the JWT signature, expiry, and audience using the project's
    Supabase JWT secret. Raises HTTPException(401) on any failure.
    """
    try:
        claims: Dict[str, Any] = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            leeway=settings.JWT_LEEWAY_SECONDS,
            options={"require": ["exp", "sub", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidAudienceError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token audience is invalid",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return claims


def _claims_to_user(claims: Dict[str, Any]) -> AuthenticatedUser:
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has no subject",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return AuthenticatedUser(
        id=str(sub),
        email=claims.get("email"),
        role=str(claims.get("role", "")),
        aud=str(claims.get("aud", "")),
        raw_claims=claims,
    )


# ── FastAPI dependencies ─────────────────────────────────────────────────

async def require_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    """
    Strict dependency: route returns 401 unless a valid Supabase JWT is supplied.
    """
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = _decode_token(creds.credentials, settings)
    return _claims_to_user(claims)


async def optional_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    settings: Settings = Depends(get_settings),
) -> Optional[AuthenticatedUser]:
    """
    Lenient dependency: returns the user if a token is present and valid;
    returns None for anonymous requests; raises 401 only when a token IS
    supplied but cannot be verified.
    """
    if creds is None or not creds.credentials:
        return None
    claims = _decode_token(creds.credentials, settings)
    return _claims_to_user(claims)


# ── Convenience for non-route code paths (e.g. middleware) ──────────────

def verify_supabase_token(token: str) -> AuthenticatedUser:
    """
    Standalone helper for non-dependency contexts.
    Raises HTTPException(401) on failure, exactly like `require_user`.
    """
    settings = get_settings()
    claims = _decode_token(token, settings)
    return _claims_to_user(claims)


__all__ = [
    "AuthenticatedUser",
    "require_user",
    "optional_user",
    "verify_supabase_token",
]


def extract_bearer_from_request(request: Request) -> Optional[str]:
    """
    Pull the raw bearer token from the Authorization header on a Request
    object. Useful for middleware or background tasks.
    """
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth:
        return None
    parts = auth.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1] or None
