"""
Voyage AI embedding client (model: voyage-law-2).

Used as an OPTIONAL semantic-search fallback when the alias map in
`document_templates.py` doesn't recognise a phrasing. We embed the user's
last message once, then compare against per-template embeddings in
Postgres (pgvector) — if cosine distance is below a threshold we treat the
best match as the chosen template.

The whole module is designed to fail gracefully: if VOYAGE_API_KEY is
missing, if Voyage returns an error, or if pgvector is not installed,
template lookup just returns None and we fall back to full AI generation.
"""
from __future__ import annotations

import logging
from typing import List, Optional, Sequence

import httpx

from ..config import Settings, get_settings

logger = logging.getLogger("legalbridge.voyage")


class VoyageError(RuntimeError):
    """Raised on Voyage transport failure or non-2xx response."""


async def embed_text(
    text: str,
    *,
    input_type: str = "query",
    settings: Optional[Settings] = None,
    timeout: float = 20.0,
) -> Optional[List[float]]:
    """
    Embed a single string with voyage-law-2. Returns None on any failure
    so callers can fall back to keyword/alias matching without breaking.

    `input_type` should be 'query' for user requests and 'document' when
    indexing templates (Voyage uses different prompt prefixes internally).
    """
    s = settings or get_settings()
    if not s.VOYAGE_API_KEY:
        logger.debug("VOYAGE_API_KEY missing — skipping semantic match")
        return None
    if not text or not text.strip():
        return None

    payload = {
        "input": [text.strip()[:8000]],  # voyage-law-2 max input ~16k tokens
        "model": s.VOYAGE_MODEL,
        "input_type": input_type,
    }
    headers = {
        "Authorization": f"Bearer {s.VOYAGE_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(s.VOYAGE_API_URL, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.warning(
                "Voyage embed failed: %s — %s",
                resp.status_code, resp.text[:300]
            )
            return None
        data = resp.json()
        vec = data.get("data", [{}])[0].get("embedding")
        if isinstance(vec, list) and vec and all(isinstance(x, (int, float)) for x in vec):
            return [float(x) for x in vec]
        return None
    except httpx.HTTPError as exc:
        logger.warning("Voyage HTTP error: %s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Voyage unexpected error: %s", exc)
        return None


async def embed_batch(
    texts: Sequence[str],
    *,
    input_type: str = "document",
    settings: Optional[Settings] = None,
    timeout: float = 30.0,
) -> Optional[List[List[float]]]:
    """Batch variant — used by any offline seeding script."""
    s = settings or get_settings()
    if not s.VOYAGE_API_KEY or not texts:
        return None
    payload = {
        "input": [t.strip()[:8000] for t in texts if t and t.strip()],
        "model": s.VOYAGE_MODEL,
        "input_type": input_type,
    }
    headers = {
        "Authorization": f"Bearer {s.VOYAGE_API_KEY}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(s.VOYAGE_API_URL, json=payload, headers=headers)
        if resp.status_code >= 400:
            logger.warning("Voyage batch failed: %s — %s", resp.status_code, resp.text[:300])
            return None
        return [d["embedding"] for d in resp.json().get("data", [])]
    except Exception as exc:  # noqa: BLE001
        logger.warning("Voyage batch error: %s", exc)
        return None


__all__ = ["embed_text", "embed_batch", "VoyageError"]
