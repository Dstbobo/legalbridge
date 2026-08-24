"""
Integration test for POST /v1/documents.

We use respx to fake the Anthropic Messages API streaming response so the
route is exercised end-to-end without burning real credits, and we monkey-
patch the template-lookup function to avoid touching the real database.
"""
from __future__ import annotations

import json
from typing import AsyncIterator, List

import httpx
import pytest
import respx
from fastapi.testclient import TestClient


# --- helpers --------------------------------------------------------------
def _fake_anthropic_stream(deltas: List[str]) -> bytes:
    """Build a fake SSE body matching Anthropic's streaming event shape."""
    lines: list[str] = []
    for d in deltas:
        evt = {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": d},
        }
        lines.append("data: " + json.dumps(evt))
    lines.append("data: [DONE]")
    # Anthropic separates events with a blank line — \n\n between each `data:`.
    return ("\n\n".join(lines) + "\n\n").encode("utf-8")


@pytest.fixture
def client(monkeypatch):
    # Disable real DB lookups in the templates service — return None so the
    # route falls through to full-generation mode.
    from app.routes import documents as docs_route

    async def _no_template(*_args, **_kwargs):
        return None

    monkeypatch.setattr(docs_route, "find_template", _no_template)

    async def _allow_quota(**_kwargs):
        return None

    monkeypatch.setattr(docs_route, "consume_provider_quota", _allow_quota)

    from app.main import app
    return TestClient(app)


# --- tests ---------------------------------------------------------------
def test_route_is_registered(client):
    schema = client.get("/openapi.json").json()
    assert "/v1/documents" in schema["paths"]
    assert "post" in schema["paths"]["/v1/documents"]


def test_root_advertises_documents_endpoint(client):
    body = client.get("/").json()
    assert body["endpoints"]["documents"] == "/v1/documents"


def test_health_still_works(client):
    # We don't have a real DB in test but the endpoint should still answer.
    r = client.get("/health/live")
    assert r.status_code == 200
    assert r.json()["status"] == "alive"


@respx.mock
def test_generate_document_streams_sse(client, auth_headers):
    deltas = ["# AFFIDAVIT\n\n", "I, JOHN DOE, ", "make oath and say:"]
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(
            200,
            headers={"content-type": "text/event-stream"},
            content=_fake_anthropic_stream(deltas),
        )
    )

    payload = {
        "messages": [{"role": "user", "content": "Draft an affidavit of loss for JOHN DOE"}],
        "userType": "lawyer",
        "summary": "",
        "profile": {"state": "Lagos"},
    }

    with client.stream("POST", "/v1/documents", json=payload, headers=auth_headers) as resp:
        assert resp.status_code == 200
        assert resp.headers["x-stream"] == "1"
        assert resp.headers["x-source"] == "documents"
        body = b"".join(resp.iter_bytes()).decode("utf-8")

    # The SSE body must contain each delta as its own data: line plus [DONE].
    assert 'data: {"text": "# AFFIDAVIT\\n\\n"}' in body
    assert "data: [DONE]" in body
    for d in deltas:
        # JSON-encoded text should round-trip back to the original.
        assert json.dumps({"text": d}, ensure_ascii=False) in body


@respx.mock
def test_anthropic_error_surfaces_user_friendly_message(client, auth_headers):
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(429, text="rate limit exceeded")
    )

    payload = {
        "messages": [{"role": "user", "content": "Draft a tenancy agreement"}],
        "userType": "other",
        "summary": "",
        "profile": {},
    }

    with client.stream("POST", "/v1/documents", json=payload, headers=auth_headers) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")

    assert "Document service temporarily unavailable" in body
    assert "data: [DONE]" in body


@respx.mock
def test_anthropic_generic_error(client, auth_headers):
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(500, text="internal server error")
    )
    payload = {
        "messages": [{"role": "user", "content": "Draft a deed of gift"}],
        "userType": "other",
        "summary": "",
        "profile": {},
    }
    with client.stream("POST", "/v1/documents", json=payload, headers=auth_headers) as resp:
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    assert "Document drafting failed" in body
    assert "data: [DONE]" in body


def test_empty_messages_are_rejected_before_provider_call(client, auth_headers):
    response = client.post("/v1/documents", json={"messages": []}, headers=auth_headers)
    assert response.status_code == 422


def test_oversized_message_is_rejected_before_provider_call(client, auth_headers):
    response = client.post(
        "/v1/documents",
        json={"messages": [{"role": "user", "content": "x" * 20_001}]},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_route_returns_rate_limit_without_calling_provider(client, auth_headers, monkeypatch):
    from fastapi import HTTPException
    from app.routes import documents as docs_route

    async def _deny_quota(**_kwargs):
        raise HTTPException(status_code=429, detail="Provider request limit exceeded")

    monkeypatch.setattr(docs_route, "consume_provider_quota", _deny_quota)
    response = client.post(
        "/v1/documents",
        json={"messages": [{"role": "user", "content": "Draft an agreement"}]},
        headers=auth_headers,
    )
    assert response.status_code == 429


def test_anonymous_paid_document_request_is_rejected(client):
    response = client.post(
        "/v1/documents",
        json={"messages": [{"role": "user", "content": "Draft an agreement"}]},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing or malformed Authorization header"


def test_invalid_jwt_is_rejected_before_provider_call(client):
    response = client.post(
        "/v1/documents",
        headers={"Authorization": "Bearer not-a-jwt"},
        json={"messages": [{"role": "user", "content": "Draft an agreement"}]},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid authentication token"


def test_service_role_token_is_not_accepted_as_end_user(client, settings):
    import time

    import jwt

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "00000000-0000-0000-0000-000000000001",
            "role": "service_role",
            "aud": "authenticated",
            "iat": now,
            "exp": now + 300,
        },
        settings.SUPABASE_JWT_SECRET,
        algorithm="HS256",
    )
    response = client.post(
        "/v1/documents",
        headers={"Authorization": f"Bearer {token}"},
        json={"messages": [{"role": "user", "content": "Draft an agreement"}]},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication token is not an end-user session"
