"""
Anthropic Messages API streaming client.

Mirrors the streaming contract used by the `chat-documents` Edge Function:
- POST https://api.anthropic.com/v1/messages with stream=true
- Read SSE events of shape `data: {<json>}`
- Yield each `content_block_delta.text` delta as it arrives.

We expose a single async generator `stream_text_deltas(...)` so routes can
forward the chunks straight into their own SSE response.
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx

from ..config import Settings, get_settings

logger = logging.getLogger("legalbridge.anthropic")


class AnthropicError(RuntimeError):
    """Raised when Anthropic returns a non-2xx response or malformed payload."""

    def __init__(self, message: str, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _build_payload(
    *,
    system: str,
    messages: List[Dict[str, Any]],
    model: str,
    max_tokens: int,
    temperature: float,
) -> Dict[str, Any]:
    """Normalise the messages list into the shape Anthropic expects."""
    normalised: List[Dict[str, Any]] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        role = "assistant" if role == "assistant" else "user"
        content = m.get("content", "")
        if content is None:
            content = ""
        normalised.append({"role": role, "content": content})
    return {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
        "system": system,
        "messages": normalised,
    }


async def stream_text_deltas(
    *,
    system: str,
    messages: List[Dict[str, Any]],
    settings: Optional[Settings] = None,
    timeout: float = 120.0,
) -> AsyncIterator[str]:
    """
    Yield successive text deltas from a Claude streaming completion.

    Raises:
        AnthropicError on transport failure or non-2xx response. Caller
        is expected to convert that to a user-facing SSE error chunk
        (the chat-documents EF does this — we keep parity).
    """
    s = settings or get_settings()
    if not s.ANTHROPIC_API_KEY:
        raise AnthropicError("ANTHROPIC_API_KEY is not configured")

    payload = _build_payload(
        system=system,
        messages=messages,
        model=s.ANTHROPIC_MODEL,
        max_tokens=s.ANTHROPIC_MAX_TOKENS,
        temperature=s.ANTHROPIC_TEMPERATURE,
    )

    headers = {
        "x-api-key": s.ANTHROPIC_API_KEY,
        "anthropic-version": s.ANTHROPIC_VERSION,
        "content-type": "application/json",
        "accept": "text/event-stream",
    }

    timeout_cfg = httpx.Timeout(timeout, connect=15.0, read=timeout, write=30.0)
    try:
        async with httpx.AsyncClient(timeout=timeout_cfg) as client:
            async with client.stream(
                "POST", s.ANTHROPIC_API_URL, json=payload, headers=headers
            ) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode("utf-8", errors="replace")
                    raise AnthropicError(
                        f"Anthropic {resp.status_code}: {body[:500]}",
                        status_code=resp.status_code,
                    )

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].lstrip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        evt = json.loads(data)
                    except json.JSONDecodeError:
                        continue

                    # Anthropic stream event shapes we care about:
                    #   {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
                    # The Edge Function reads `j.delta?.text` which covers
                    # both `content_block_delta` and any future variants.
                    delta = evt.get("delta") or {}
                    text = delta.get("text")
                    if isinstance(text, str) and text:
                        yield text
    except AnthropicError:
        raise
    except httpx.HTTPError as exc:
        raise AnthropicError(f"HTTP transport error: {exc}") from exc


__all__ = ["stream_text_deltas", "AnthropicError"]
