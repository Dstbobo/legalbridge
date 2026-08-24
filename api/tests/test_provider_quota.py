from __future__ import annotations

import httpx
import pytest
import respx
from fastapi import HTTPException

from app.provider_quota import consume_provider_quota


@pytest.mark.asyncio
@respx.mock
async def test_quota_rpc_allows_request(settings):
    route = respx.post(
        "https://example.supabase.co/rest/v1/rpc/consume_provider_quota"
    ).mock(return_value=httpx.Response(200, json=True))
    await consume_provider_quota(
        user_id="00000000-0000-0000-0000-000000000001",
        route="api-documents",
        limit=6,
        window_seconds=60,
        settings=settings,
    )
    assert route.called
    request = route.calls.last.request
    assert request.headers["apikey"] == settings.SUPABASE_SERVICE_ROLE_KEY
    assert settings.SUPABASE_SERVICE_ROLE_KEY not in str(request.content)


@pytest.mark.asyncio
@respx.mock
async def test_quota_rpc_denial_returns_429(settings):
    respx.post(
        "https://example.supabase.co/rest/v1/rpc/consume_provider_quota"
    ).mock(return_value=httpx.Response(200, json=False))
    with pytest.raises(HTTPException) as raised:
        await consume_provider_quota(
            user_id="00000000-0000-0000-0000-000000000001",
            route="api-documents",
            limit=6,
            window_seconds=60,
            settings=settings,
        )
    assert raised.value.status_code == 429


@pytest.mark.asyncio
@respx.mock
async def test_quota_rpc_failure_fails_closed(settings):
    respx.post(
        "https://example.supabase.co/rest/v1/rpc/consume_provider_quota"
    ).mock(return_value=httpx.Response(500, json={"error": "unavailable"}))
    with pytest.raises(HTTPException) as raised:
        await consume_provider_quota(
            user_id="00000000-0000-0000-0000-000000000001",
            route="api-documents",
            limit=6,
            window_seconds=60,
            settings=settings,
        )
    assert raised.value.status_code == 503
