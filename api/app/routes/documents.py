"""
LegalBridge API — /v1/documents endpoint.

Strangler-pattern replacement for the `chat-documents` Supabase Edge
Function. Identical input shape, identical SSE output contract, identical
system-prompt construction. The frontend can move one URL at a time.

Request:
    POST /v1/documents
    Authorization: Bearer <verified-supabase-user-jwt>
    Content-Type: application/json
    {
        "messages": [{"role": "user", "content": "..."}, ...],
        "userType": "lawyer" | "non_lawyer" | "other" | ...,
        "summary":  "<rolling conversation summary>",
        "profile":  {"state": "Lagos", "specializations": ["litigation"]}
    }

Response: text/event-stream
    data: {"text": "first chunk"}\n\n
    data: {"text": "second chunk"}\n\n
    ...
    data: [DONE]\n\n

Headers (parity with the Edge Function):
    X-Stream: 1
    X-Source: documents
    Cache-Control: no-cache
    Connection: keep-alive
"""
from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from ..auth import AuthenticatedUser, require_user
from ..config import Settings, get_settings
from ..database import engine
from ..provider_quota import consume_provider_quota
from ..services import anthropic_client
from ..services.anthropic_client import AnthropicError
from ..services.document_prompts import (
    DOCUMENT_PROMPTS,
    detect_document_type,
    extract_facts,
    nigerian_today,
)
from ..services.document_templates import StoredTemplate, find_template

logger = logging.getLogger("legalbridge.documents")

router = APIRouter(prefix="/v1/documents", tags=["documents"])


# ── Request schema ───────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"] = "user"
    content: str = Field(min_length=1, max_length=20_000)


class DocumentRequest(BaseModel):
    messages: List[ChatMessage] = Field(min_length=1, max_length=40)
    userType: str = Field(default="other", max_length=40)  # noqa: N815 — mirror EF field name exactly
    summary: str = Field(default="", max_length=20_000)
    profile: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("profile")
    @classmethod
    def profile_must_be_bounded(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > 20_000:
            raise ValueError("profile is too large")
        return value


# ── System-prompt builder ────────────────────────────────────────────────
def _build_system_prompt(
    *,
    last_msg: str,
    doc_type: str,
    user_type: str,
    summary: str,
    profile: Dict[str, Any],
    stored: Optional[StoredTemplate],
) -> str:
    """
    1:1 port of the systemPrompt construction inside chat-documents/index.ts.
    Same ordering, same wording, same flags — only the language differs.
    """
    today = nigerian_today()
    doc_template = DOCUMENT_PROMPTS.get(doc_type) or DOCUMENT_PROMPTS["agreement"]

    sp = (
        "You are LegalBridge AI, built by DST Global Innovative Nigeria Ltd "
        "(Akwanga, Nasarawa State), founded by Daniel Thankgod. Never mention "
        "Google, Gemini, Claude, Anthropic, or any underlying AI technology. "
        "Never mention any knowledge cutoff date. Never include AI disclaimers "
        "inside a document.\n\n"
        "DOCUMENT GENERATION BEHAVIOR (HIGH PRIORITY)\n\n"
        "You are LegalBridge AI, a Nigerian legal drafting assistant. Your role "
        "is to generate complete, professional legal documents immediately upon "
        "request.\n\n"
        "Core Behavior:\n\n"
        "Step 1 — Extract: Read the user's message carefully. Identify all "
        "details already provided: full names of parties, their roles "
        "(e.g. landlord/tenant, employer/employee, petitioner/respondent), "
        "dates, addresses, amounts, statutory sections, and the specific "
        "facts of the situation.\n\n"
        "Step 2 — Check Required Information: Every legal document requires "
        "the following before it can be generated. These CANNOT be replaced "
        "with placeholder text like [NAME], [PARTY], [APPLICANT], or any "
        "other bracket placeholder:\n"
        "  • Full legal names of ALL parties involved\n"
        "  • The core facts: what happened, when, and where\n"
        "  • The subject matter: property address, contract amount, company "
        "name, offence, or other specific detail that makes this document "
        "unique to this user\n\n"
        "Step 3 — If required information is missing, return NEED_DETAILS "
        "and ask for it BEFORE generating anything. Do NOT generate a "
        "document with placeholder party names. There are no Nigerian legal "
        "defaults for people's names or for the specific facts of a case.\n\n"
        f"Step 4 — Generate: Once all required information is confirmed, "
        f"produce the complete document immediately. Procedural details MAY "
        f"use Nigerian legal defaults: court = High Court of Justice of the "
        f"relevant state; jurisdiction = state mentioned or FCT Abuja if "
        f"none; date = today ({today}); counsel = Counsel for the "
        f"Applicant/Party.\n\n"
        "NEED_DETAILS Rule — Return NEED_DETAILS whenever the full names of "
        "parties OR the core facts of the case are absent. Format:\n"
        "NEED_DETAILS: [One sentence explaining what you need. Then a "
        "numbered list of 3-6 specific questions.]\n"
        "Example — user says 'draft a demand letter for my landlord':\n"
        "NEED_DETAILS: To draft your demand letter I need a few details:\n"
        "1. Your full name\n"
        "2. Landlord's full name and address\n"
        "3. Amount of deposit owed (₦)\n"
        "4. Date the tenancy ended\n"
        "5. How many days have passed since you requested the deposit?\n"
        "The literal string \"NEED_DETAILS:\" must appear ONLY as the very "
        "first characters of a clarification response. NEVER include it "
        "inside a generated document.\n\n"
        "Tone and Style — Write in clear formal Nigerian legal drafting style. "
        "Ensure the document is immediately usable in practice. Output only the "
        "requested document, not commentary or explanation.\n\n"
        "Additional Drafting Standards:\n"
        f"- Today's date is {today}. Write any required date in this exact "
        f"Nigerian format. Never use placeholder text like [DATE], [TODAY'S "
        f"DATE], or [INSERT DATE].\n"
        "- For court reference numbers that don't exist yet, write "
        "\"Suit No: [TO BE ASSIGNED]\" only.\n"
        "- Number all clauses properly.\n"
        "- Include execution/signature blocks (signature lines, witnesses, "
        "jurat where applicable).\n"
        "- Cite governing Nigerian statutes in relevant clauses by exact "
        "section number.\n"
        "- NEVER add casual sign-offs (\"Good luck\", \"Hope this helps\", "
        "\"Best wishes\", \"Feel free to reach out\"). Documents end with the "
        "signature/jurat/execution block only.\n\n"
        f"DOCUMENT TYPE DETECTED: {doc_type.upper()}\n"
        f"{doc_template}"
    )

    # Persona context (state only — no role-conditional output shape).
    state = profile.get("state") if isinstance(profile, dict) else None
    if state:
        sp += f"\nUser's state: {state} — apply state-specific laws where relevant."

    if user_type == "lawyer" and isinstance(profile, dict):
        specs = profile.get("specializations") or []
        if isinstance(specs, list) and specs:
            sp += "\nUser's practice specializations: " + ", ".join(map(str, specs)) + "."

    sp += (
        "\n\nIMPORTANT: Output ONLY the legal document. No introduction "
        "sentence (\"Here is your...\"), no closing prose (\"This document "
        "means...\", \"Let me know if...\"), no plain-English explanation "
        "appended. The document must START with the formal heading (e.g. "
        "\"# AFFIDAVIT\", \"IN THE HIGH COURT...\", \"THIS TENANCY "
        "AGREEMENT...\") and END with the signature/jurat/execution block. "
        "Nothing else.\n\n"
        "NEVER wrap the document in markdown code fences (```). Output the "
        "document directly as plain markdown content with # / ## / **bold** "
        "formatting — never as a code block."
    )

    # Fill-template mode.
    if stored:
        applicable = (
            f"Applicable Law: {stored.applicable_law}\n\n"
            if stored.applicable_law
            else ""
        )
        if stored.is_official:
            sp += (
                "\n\n[FILL-TEMPLATE MODE — OFFICIAL FORM]\n"
                "The following is a Nigerian legal template that MUST be "
                "followed structurally without modification. Fill in every "
                "`{{PLACEHOLDER}}` with the actual value from the user's "
                f"message or the Nigerian-context default (today's date is "
                f"{today}). Do NOT add new sections, do NOT remove sections, "
                "do NOT rewrite paragraphs. ONLY substitute placeholders.\n\n"
                f"{applicable}"
                f"TEMPLATE:\n{stored.content}\n[END TEMPLATE]"
            )
        else:
            sp += (
                "\n\n[FILL-TEMPLATE MODE — LAWYER-DRAFTED]\n"
                "The following is a Nigerian legal template authored by senior "
                "practitioners. Use it as the structural basis for your draft. "
                "Fill in every `{{PLACEHOLDER}}` with the actual value from the "
                "user's message or a sensible Nigerian-context default "
                f"(today's date is {today}). You may add minor extra clauses if "
                "the user's facts clearly require them, but you must preserve "
                "the template's structure, headings, and legal language. Do "
                "NOT rewrite sections that are already complete.\n\n"
                f"{applicable}"
                f"TEMPLATE:\n{stored.content}\n[END TEMPLATE]"
            )

    # Conversation summary.
    if summary:
        sp += f"\n\n[CONVERSATION CONTEXT]\n{summary}\n[END CONTEXT]"

    # Deterministic FACTS block.
    facts = extract_facts(last_msg)
    if facts:
        sp += (
            "\n\n[FACTS PROVIDED BY USER — YOU MUST USE THESE EXACT VALUES IN THE DRAFT]\n"
            + "\n".join("• " + f for f in facts)
            + "\n\nUse these EXACT names and details in the document. NEVER "
              "substitute them with [APPLICANT'S NAME], [PETITIONER'S NAME], "
              "[DEPONENT'S NAME], [NAME], or any other placeholder. The person "
              "named above is the Applicant/Petitioner/Deponent/Party — use "
              "their actual name in every field where that role appears.\n"
              "[END FACTS]\n\n"
              f"User's original request: \"{last_msg[:600]}\""
        )
    else:
        sp += f"\n\nUser's original request: \"{last_msg[:600]}\""

    return sp


# ── SSE stream generator ─────────────────────────────────────────────────
def _sse_chunk(text_value: str) -> bytes:
    return f"data: {json.dumps({'text': text_value}, ensure_ascii=False)}\n\n".encode("utf-8")


_SSE_DONE = b"data: [DONE]\n\n"


def _is_billing_error(msg: str) -> bool:
    import re as _re
    return bool(_re.search(r"credit balance|billing|429|rate.?limit", msg, _re.IGNORECASE))


async def _generate_sse(
    *,
    system_prompt: str,
    messages: List[Dict[str, Any]],
    settings: Settings,
) -> AsyncIterator[bytes]:
    """Stream Claude deltas as SSE events. Errors become a single user-facing chunk + [DONE]."""
    try:
        async for delta in anthropic_client.stream_text_deltas(
            system=system_prompt,
            messages=messages,
            settings=settings,
        ):
            yield _sse_chunk(delta)
    except AnthropicError as exc:
        logger.error("chat-documents provider failure status=%s", exc.status_code)
        if exc.status_code == 429 or _is_billing_error(str(exc)):
            user_facing = (
                "Document service temporarily unavailable due to a billing issue. "
                "The operator has been notified — please try again shortly."
            )
        else:
            user_facing = "Document drafting failed. Please try again."
        yield _sse_chunk(user_facing)
    except Exception as exc:  # noqa: BLE001
        logger.exception("chat-documents unexpected error: %s", exc)
        yield _sse_chunk("Document drafting failed. Please try again.")
    finally:
        yield _SSE_DONE


# ── Route ────────────────────────────────────────────────────────────────
@router.post(
    "",
    summary="Generate a Nigerian legal document (streaming SSE)",
    response_class=StreamingResponse,
)
async def generate_document(
    payload: DocumentRequest,
    request: Request,
    user: AuthenticatedUser = Depends(require_user),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """
    Streaming document drafter. See module docstring for the full contract.

    Auth is mandatory because every successful request can spend provider
    credits. The user identifier is taken only from the verified JWT.
    """
    await consume_provider_quota(
        user_id=user.id,
        route="api-documents",
        limit=6,
        window_seconds=60,
        settings=settings,
    )
    messages_dicts: List[Dict[str, Any]] = [m.model_dump() for m in payload.messages]
    last_msg = messages_dicts[-1]["content"] if messages_dicts else ""
    doc_type = detect_document_type(last_msg)

    # Template lookup (alias → DB exact → Voyage semantic).
    stored = await find_template(engine, last_msg, settings=settings) if last_msg else None

    system_prompt = _build_system_prompt(
        last_msg=last_msg,
        doc_type=doc_type,
        user_type=payload.userType,
        summary=payload.summary,
        profile=payload.profile,
        stored=stored,
    )

    logger.info(
        "documents.generate user=%s doc_type=%s template=%s msg_chars=%d",
        user.id,
        doc_type,
        (stored.document_type if stored else "none"),
        len(last_msg),
    )

    return StreamingResponse(
        _generate_sse(
            system_prompt=system_prompt,
            messages=messages_dicts,
            settings=settings,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Stream": "1",
            "X-Source": "documents",
        },
    )


__all__ = ["router"]
