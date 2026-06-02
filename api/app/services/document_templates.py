"""
Template lookup for /v1/documents.

Two-tier match:
1. **Alias map** (38 entries, 1:1 port of TEMPLATE_ALIASES in the Edge
   Function). Longest-key-first so "non-disclosure agreement" beats
   "non-disclosure". This is fast, deterministic, and free.
2. **Voyage semantic fallback** (voyage-law-2). Only used if (1) misses
   AND `document_templates` has an `embedding` column populated. Failures
   here are non-fatal — we just return None and the route falls back to
   full AI generation.

Both tiers ultimately return a `StoredTemplate` dataclass (or None) so
the route's downstream logic is identical regardless of how we matched.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from ..config import Settings, get_settings
from . import voyage_client

logger = logging.getLogger("legalbridge.templates")


# ── Alias map — verbatim port from chat-documents/index.ts ──────────────
TEMPLATE_ALIASES: dict[str, str] = {
    "affidavit": "general affidavit",
    "loss affidavit": "affidavit of loss",
    "name change": "affidavit of change of name",
    "change of name": "affidavit of change of name",
    "next of kin": "affidavit of next of kin",
    "age declaration": "statutory declaration of age",
    "bail": "bail application",
    "writ": "writ of summons",
    "statement of claim": "statement of claim",
    "statement of defence": "statement of defence",
    "statement of defense": "statement of defence",
    "motion": "motion on notice",
    "ex parte": "motion ex parte",
    "appeal": "notice of appeal",
    "fundamental rights": "fundamental rights enforcement application",
    "frep": "fundamental rights enforcement application",
    "tenancy": "tenancy agreement",
    "lease": "tenancy agreement",
    "deed of assignment": "deed of assignment",
    "land assignment": "deed of assignment",
    "power of attorney": "power of attorney",
    "poa": "power of attorney",
    "quit notice": "notice to quit",
    "notice to quit": "notice to quit",
    "deed of gift": "deed of gift",
    "partnership": "partnership agreement",
    "nda": "non-disclosure agreement",
    "non-disclosure": "non-disclosure agreement",
    "non disclosure": "non-disclosure agreement",
    "confidentiality agreement": "non-disclosure agreement",
    "board resolution": "board resolution",
    "service agreement": "service agreement",
    "consultancy": "service agreement",
    "mou": "memorandum of understanding",
    "memorandum of understanding": "memorandum of understanding",
    "employment contract": "employment contract",
    "contract of employment": "employment contract",
    "appointment letter": "offer letter",
    "offer letter": "offer letter",
    "termination": "termination letter",
    "termination letter": "termination letter",
    "query letter": "query letter",
    "will": "last will and testament",
    "last will": "last will and testament",
    "divorce": "divorce petition",
    "dissolution of marriage": "divorce petition",
    "loan": "loan agreement",
    "loan agreement": "loan agreement",
    "promissory note": "promissory note",
    "foi": "FOI request",
    "foi request": "FOI request",
    "freedom of information": "FOI request",
    "press accreditation": "press accreditation letter",
    "demand letter": "letter of demand",
    "letter of demand": "letter of demand",
    "cease and desist": "cease and desist letter",
    "copyright assignment": "copyright assignment",
    "cac business name": "CAC business name registration application",
    "business name registration": "CAC business name registration application",
    "invitation letter": "invitation letter",
    "visa invitation": "invitation letter",
}


@dataclass(frozen=True)
class StoredTemplate:
    document_type: str
    title: str
    content: str
    is_official: bool
    applicable_law: Optional[str] = None


def canonicalise_doc_type(message: str) -> Optional[str]:
    """
    Look for an alias keyword inside the message (word-boundary match,
    longest-key-first) and return the canonical `document_type`. None
    if nothing matches — caller can then try the embedding fallback.
    """
    m = (message or "").lower()
    # Sort by descending length so "non-disclosure agreement" beats
    # "non-disclosure" (parity with the Edge Function).
    for key in sorted(TEMPLATE_ALIASES.keys(), key=len, reverse=True):
        # Word-boundary match. re.escape so dotted keys etc. survive.
        pattern = rf"\b{re.escape(key)}\b"
        if re.search(pattern, m, flags=re.IGNORECASE):
            return TEMPLATE_ALIASES[key]
    return None


# ── DB lookup helpers ────────────────────────────────────────────────────
async def fetch_template_by_type(
    engine: AsyncEngine, doc_type: str
) -> Optional[StoredTemplate]:
    """Exact-match lookup by `document_type`, returns the first row."""
    sql = text(
        """
        SELECT document_type, title, content, is_official, applicable_law
        FROM public.document_templates
        WHERE document_type = :doc_type
        ORDER BY is_official DESC NULLS LAST
        LIMIT 1
        """
    )
    try:
        async with engine.connect() as conn:
            row = (await conn.execute(sql, {"doc_type": doc_type})).mappings().first()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Template lookup failed for %r: %s", doc_type, exc)
        return None
    if not row:
        return None
    return StoredTemplate(
        document_type=row["document_type"],
        title=row.get("title") or doc_type,
        content=row.get("content") or "",
        is_official=bool(row.get("is_official")),
        applicable_law=row.get("applicable_law"),
    )


async def fetch_template_semantic(
    engine: AsyncEngine,
    message: str,
    *,
    settings: Optional[Settings] = None,
) -> Optional[StoredTemplate]:
    """
    Voyage-embedding fallback. Returns None on ANY failure (no Voyage key,
    no pgvector, no embeddings populated, distance over threshold). The
    caller falls back to full AI generation in that case.

    Expected schema (optional — graceful if absent):
        ALTER TABLE document_templates
            ADD COLUMN IF NOT EXISTS embedding vector(1024);
    """
    s = settings or get_settings()
    vec = await voyage_client.embed_text(message, input_type="query", settings=s)
    if not vec:
        return None

    # pgvector accepts a string like "[0.1,0.2,...]"
    vec_literal = "[" + ",".join(f"{x:.7f}" for x in vec) + "]"
    sql = text(
        """
        SELECT document_type, title, content, is_official, applicable_law,
               (embedding <=> CAST(:vec AS vector)) AS distance
        FROM public.document_templates
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> CAST(:vec AS vector)
        LIMIT 1
        """
    )
    try:
        async with engine.connect() as conn:
            row = (await conn.execute(sql, {"vec": vec_literal})).mappings().first()
    except Exception as exc:  # noqa: BLE001
        # Most common reasons: vector ext missing, column absent, no rows.
        # All non-fatal — log and let the route do full generation.
        logger.info("Semantic template lookup unavailable: %s", exc)
        return None

    if not row:
        return None
    distance = float(row.get("distance") or 1.0)
    if distance > s.VOYAGE_MATCH_MAX_DISTANCE:
        logger.debug(
            "Semantic match too far (dist=%.3f > %.3f) — falling back to AI",
            distance, s.VOYAGE_MATCH_MAX_DISTANCE,
        )
        return None
    return StoredTemplate(
        document_type=row["document_type"],
        title=row.get("title") or row["document_type"],
        content=row.get("content") or "",
        is_official=bool(row.get("is_official")),
        applicable_law=row.get("applicable_law"),
    )


async def find_template(
    engine: AsyncEngine,
    message: str,
    *,
    settings: Optional[Settings] = None,
) -> Optional[StoredTemplate]:
    """
    Public entry point used by the /v1/documents route.

    Order: alias map → DB exact lookup → Voyage semantic fallback.
    """
    canonical = canonicalise_doc_type(message)
    if canonical:
        tpl = await fetch_template_by_type(engine, canonical)
        if tpl and tpl.content:
            return tpl

    # Alias miss (or stored row is empty) — try semantic search.
    return await fetch_template_semantic(engine, message, settings=settings)


__all__ = [
    "TEMPLATE_ALIASES",
    "StoredTemplate",
    "canonicalise_doc_type",
    "fetch_template_by_type",
    "fetch_template_semantic",
    "find_template",
]
