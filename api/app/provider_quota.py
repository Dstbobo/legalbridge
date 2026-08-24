"""Fail-closed, database-backed provider quota checks."""
from __future__ import annotations

import httpx
from fastapi import HTTPException, status

from .config import Settings


async def consume_provider_quota(
    *,
    user_id: str,
    route: str,
    limit: int,
    window_seconds: int,
    settings: Settings,
) -> None:
    """Consume one atomic quota unit through the service-role-only RPC."""
    url = f"{settings.SUPABASE_URL.rstrip('/')}/rest/v1/rpc/consume_provider_quota"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "p_user_id": user_id,
        "p_route": route,
        "p_limit": limit,
        "p_window_seconds": window_seconds,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0)) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Usage controls are temporarily unavailable",
        ) from exc
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Usage controls are temporarily unavailable",
        )
    try:
        allowed = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Usage controls are temporarily unavailable",
        ) from exc
    if allowed is not True:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Provider request limit exceeded",
            headers={"Retry-After": str(window_seconds)},
        )


__all__ = ["consume_provider_quota"]
