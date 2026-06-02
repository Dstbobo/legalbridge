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
def test_generate_document_streams_sse(client):
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

    with client.stream("POST", "/v1/documents", json=payload) as resp:
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
def test_anthropic_error_surfaces_user_friendly_message(client):
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(429, text="rate limit exceeded")
    )

    payload = {
        "messages": [{"role": "user", "content": "Draft a tenancy agreement"}],
        "userType": "other",
        "summary": "",
        "profile": {},
    }

    with client.stream("POST", "/v1/documents", json=payload) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")

    assert "Document service temporarily unavailable" in body
    assert "data: [DONE]" in body


@respx.mock
def test_anthropic_generic_error(client):
    respx.post("https://api.anthropic.com/v1/messages").mock(
        return_value=httpx.Response(500, text="internal server error")
    )
    payload = {
        "messages": [{"role": "user", "content": "Draft a deed of gift"}],
        "userType": "other",
        "summary": "",
        "profile": {},
    }
    with client.stream("POST", "/v1/documents", json=payload) as resp:
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    assert "Document drafting failed" in body
    assert "data: [DONE]" in body


def test_empty_messages_does_not_crash(client, monkeypatch):
    # No messages → no template lookup, route should still serialise a system
    # prompt and attempt to call Anthropic. We mock that out to avoid network.
    from app.services import anthropic_client

    async def _fake_stream(*_args, **_kwargs):
        if False:
            yield ""  # pragma: no cover

    monkeypatch.setattr(anthropic_client, "stream_text_deltas", _fake_stream)

    with client.stream("POST", "/v1/documents", json={"messages": []}) as resp:
        assert resp.status_code == 200
        body = b"".join(resp.iter_bytes()).decode("utf-8")
    assert body.strip().endswith("[DONE]")
