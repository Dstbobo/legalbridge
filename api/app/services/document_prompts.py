"""
Document drafting prompts and deterministic helpers.

This is a 1:1 port of the constants and small functions in
`supabase/functions/chat-documents/index.ts` so the FastAPI route at
`/v1/documents` produces the exact same system prompt the Edge Function
does today. Behaviour-preserving port — do not edit prompts here without
also updating the Edge Function or the parity tests will diverge.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Dict, List, Optional


# ── Nigerian-style today's date ("3rd June, 2026") ──────────────────────
def nigerian_today(now: Optional[datetime] = None) -> str:
    """Return today's date in Nigerian legal-drafting format."""
    d = now or datetime.now(timezone.utc).astimezone()
    day = d.day
    if 11 <= day <= 13:
        suffix = "th"
    elif day % 10 == 1:
        suffix = "st"
    elif day % 10 == 2:
        suffix = "nd"
    elif day % 10 == 3:
        suffix = "rd"
    else:
        suffix = "th"
    months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]
    return f"{day}{suffix} {months[d.month - 1]}, {d.year}"


# ── Document-type → drafting prompt fragment ────────────────────────────
# Mirror of DOCUMENT_PROMPTS in chat-documents/index.ts.
DOCUMENT_PROMPTS: Dict[str, str] = {
    "affidavit": """Draft a complete Nigerian affidavit. Include:
- Title: AFFIDAVIT OF [NAME]
- Deponent details (name, address, occupation)
- Sworn statement opening: "I, [NAME], make oath and say as follows:"
- Numbered paragraphs for each fact
- Jurat: "SWORN at [PLACE] this <ACTUAL TODAY'S DATE>" with signature lines for deponent and Commissioner for Oaths
- Apply Evidence Act 2011 (ss.107-119) requirements""",

    "agreement": """Draft a complete Nigerian agreement/contract. Include:
- Title and parties (full legal names, addresses)
- Recitals (WHEREAS clauses)
- Definitions clause
- Operative clauses (numbered)
- Representations and warranties
- Obligations of each party
- Term and termination
- Dispute resolution (arbitration/litigation)
- Governing law: Laws of [State], Nigeria
- Execution block with signature lines, dates, witnesses
- Apply Contract Law principles and CAMA 2020 where relevant""",

    "deed": """Draft a complete Nigerian deed. Include:
- THIS DEED is made this <ACTUAL TODAY'S DATE>
- Full parties with capacity statement
- Recitals
- Operative words ("NOW THIS DEED WITNESSES")
- Consideration
- Operative clauses
- Covenants
- Execution: signed, sealed and delivered
- Attestation clause with witnesses
- Apply Land Use Act 1978 and Stamp Duties Act requirements""",

    "petition": """Draft a complete Nigerian court petition. Include:
- Court heading (full court name, division, case number)
- Parties (Petitioner vs Respondent)
- Introduction paragraph
- Numbered grounds/paragraphs
- Statement of facts
- Legal basis (statute + section numbers)
- Relief sought (numbered)
- Prayer
- Petitioner signature block and date
- Apply relevant Nigerian court rules""",

    "motion": """Draft a complete Nigerian court motion. Include:
- Court heading
- MOTION ON NOTICE / EX PARTE MOTION
- Parties
- TAKE NOTICE that [Applicant] will move the court
- Grounds (numbered)
- Relief sought
- Supporting affidavit reference
- Written address reference
- Counsel signature block
- Apply relevant court rules (Federal/State High Court Civil Procedure Rules)""",

    "letter": """Draft a complete Nigerian legal letter. Include:
- Letterhead (Law firm name, address, phone, email)
- Date
- Addressee (full name and address)
- Our Ref / Your Ref
- Subject line (bold/underlined)
- Salutation
- Body paragraphs (clear, professional)
- Closing
- Signatory name, qualification (BL), and designation
- Apply Nigerian Bar Association professional standards""",

    "notice": """Draft a complete Nigerian legal notice. Include:
- TAKE NOTICE / NOTICE TO QUIT / STATUTORY NOTICE (as applicable)
- Parties
- Clear statement of the notice
- Legal basis (statute and section)
- Time period given
- Consequences of non-compliance
- Date and signature
- Witness/service details
- Apply relevant Nigerian statute""",

    "memo": """Draft a complete Nigerian legal memorandum. Include:
- LEGAL MEMORANDUM
- TO / FROM / DATE / RE: headers
- EXECUTIVE SUMMARY
- BACKGROUND FACTS
- ISSUES FOR CONSIDERATION (numbered)
- APPLICABLE LAW (statutes, sections, cases)
- ANALYSIS (issue by issue)
- RECOMMENDATIONS
- CONCLUSION
- Author signature
- Apply Nigerian law and professional drafting standards""",

    "writ": """Draft a complete Nigerian Writ of Summons. Include:
- Court heading (full court name)
- Suit No: [TO BE ASSIGNED]
- WRIT OF SUMMONS
- Plaintiff details
- Defendant details
- ENDORSEMENT OF CLAIM (statement of claim summary)
- INDORSEMENT AS TO SERVICE
- Issued by the Registrar
- Apply relevant High Court Civil Procedure Rules""",

    "tenancy": """Draft a complete Nigerian Tenancy Agreement. Include:
- Parties (Landlord and Tenant — full names, addresses)
- Property description
- Term of tenancy (start date, duration)
- Rent amount and payment schedule
- Security deposit
- Tenant obligations (maintenance, no subletting, etc.)
- Landlord obligations (quiet enjoyment, repairs)
- Prohibited uses
- Termination provisions (notice periods per Lagos Tenancy Law 2011 or applicable state law)
- Dispute resolution
- Execution block (signatures, witnesses, date)
- Apply Lagos State Tenancy Law 2011 or relevant state tenancy law""",

    "employment": """Draft a complete Nigerian Employment Contract. Include:
- Parties (Employer and Employee)
- Position and job description
- Commencement date
- Probation period
- Remuneration (salary, allowances, benefits)
- Working hours
- Leave entitlements (annual, sick, maternity/paternity)
- Confidentiality and non-disclosure
- Intellectual property assignment
- Termination (notice periods per Labour Act s.11)
- Post-employment restrictions
- Governing law: Laws of Nigeria / Labour Act (Cap L1 LFN 2004)
- Execution block
- Apply Labour Act (Cap L1 LFN 2004) and Pension Reform Act 2014""",

    "divorce": """Draft a complete Nigerian Petition for Dissolution of Marriage. Include:
- Court heading (High Court)
- PETITION FOR DISSOLUTION OF MARRIAGE
- Petitioner and Respondent details
- Date and place of marriage
- Children of the marriage
- Grounds: irretrievable breakdown of marriage
- Particulars of breakdown (adultery/cruelty/desertion/separation)
- History of the marriage
- Prayers (dissolution, custody, maintenance, property)
- Petitioner's verification
- Apply Matrimonial Causes Act (Cap M7 LFN 2004)""",
}


def detect_document_type(message: str) -> str:
    """
    Classify the requested document into one of DOCUMENT_PROMPTS' keys.
    Mirrors detectDocumentType() in chat-documents/index.ts EXACTLY —
    including the priority order (first match wins) and the fallback.
    """
    m = message.lower()
    if re.search(r"affidavit", m):
        return "affidavit"
    if re.search(r"tenancy|tenancy\s+agreement|lease\s+agreement", m):
        return "tenancy"
    if re.search(r"employment\s+contract|contract\s+of\s+employment|offer\s+letter", m):
        return "employment"
    if re.search(r"divorce|dissolution\s+of\s+marriage|matrimonial\s+petition", m):
        return "divorce"
    if re.search(r"deed", m):
        return "deed"
    if re.search(r"petition", m):
        return "petition"
    if re.search(r"motion|application\s+to\s+court", m):
        return "motion"
    if re.search(r"writ|writ\s+of\s+summons", m):
        return "writ"
    if re.search(r"notice\s+to\s+quit|quit\s+notice|legal\s+notice", m):
        return "notice"
    if re.search(r"memorandum|legal\s+memo", m):
        return "memo"
    if re.search(r"agreement|contract|mou|memorandum\s+of\s+understanding", m):
        return "agreement"
    if re.search(r"letter\s+of\s+demand|demand\s+letter|legal\s+letter", m):
        return "letter"
    return "agreement"


# ── Deterministic fact extraction ────────────────────────────────────────
_NAME_RX = re.compile(
    r"\b((?:Mr\.?|Mrs\.?|Miss|Ms\.?|Dr\.?|Hon\.?|Chief|Alhaji|Barr\.?|Prof\.?|Engr\.?)\s+)?"
    r"([A-Z][a-z]{1,}\s+[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})?)"
)
_NAME_BLOCKLIST = re.compile(
    r"^(Criminal Code|Penal Code|Police Station|High Court|Federal High|State High|"
    r"Court of Appeal|Supreme Court|Magistrate Court|Area Command|Land Use|"
    r"Evidence Act|Labour Act|Section|Lagos State|Rivers State|Kano State|"
    r"Nasarawa State|FCT Abuja)"
)
_CHARGE_RX = re.compile(
    r"\b(?:Section|Sec\.?|s\.?)\s*\d+[A-Z]?(?:\(\d+\))?"
    r"(?:\s+of\s+the\s+[A-Z][\w\s]+?(?:Act|Code|Law|CFRN|Constitution))?",
    re.IGNORECASE,
)
_STATION_RX = re.compile(
    r"\b([A-Z][\w\s]+?(?:Police Station|Area Command|Divisional Headquarters|Police Headquarters))\b"
)
_DETENTION_RX = re.compile(
    r"\b(?:held|detained|in custody|locked up|remanded)\s+(?:for\s+)?"
    r"(\d+\s+(?:days?|weeks?|months?|hours?))",
    re.IGNORECASE,
)
_COURT_RX = re.compile(
    r"\b((?:High|Federal High|State High|Magistrate|Supreme|Customary|Sharia|"
    r"National Industrial|Court of Appeal)\s+Court(?:\s+of\s+[A-Z][\w\s]+)?)",
    re.IGNORECASE,
)
_AMOUNT_RX = re.compile(
    r"(?:₦|NGN\s*|N\s*)\s*[\d,]+(?:\.\d+)?(?:\s*(?:million|m|thousand|k|billion|b))?",
    re.IGNORECASE,
)
_ADDRESS_RX = re.compile(
    r"(?:Plot|No\.|Number)\s+[\w\s,-]+?"
    r"(?:Street|Road|Avenue|Close|Crescent|Drive|Way|Estate|Lane|Boulevard)[\w\s,]*",
    re.IGNORECASE,
)


def extract_facts(message: str) -> List[str]:
    """
    Pull deterministic facts (names, statutes, courts, amounts, ...) out of
    the user message so we can pin them into the system prompt's FACTS block.
    Same heuristics as the Edge Function.
    """
    facts: List[str] = []

    names: List[str] = []
    seen_names = set()
    for match in _NAME_RX.finditer(message):
        full = (match.group(1) or "") + match.group(2)
        full = full.strip()
        if _NAME_BLOCKLIST.match(full):
            continue
        if full not in seen_names:
            seen_names.add(full)
            names.append(full)
    if names:
        facts.append("PERSON NAMES MENTIONED: " + " | ".join(names))

    charges = list(dict.fromkeys(_CHARGE_RX.findall(message)))
    if charges:
        facts.append("LAW/STATUTE REFERENCES: " + " | ".join(charges))

    station = _STATION_RX.search(message)
    if station:
        facts.append(f"POLICE LOCATION: {station.group(0)}")

    detention = _DETENTION_RX.search(message)
    if detention:
        facts.append(f"DETENTION DURATION: {detention.group(1)}")

    court = _COURT_RX.search(message)
    if court:
        facts.append(f"COURT MENTIONED: {court.group(1)}")

    amounts_raw = _AMOUNT_RX.findall(message)
    if amounts_raw:
        seen_amt: List[str] = []
        for a in amounts_raw:
            a2 = a.strip()
            if a2 not in seen_amt:
                seen_amt.append(a2)
        facts.append("AMOUNTS: " + " | ".join(seen_amt))

    addresses_raw = _ADDRESS_RX.findall(message)
    if addresses_raw:
        seen_addr: List[str] = []
        for a in addresses_raw:
            a2 = a.strip()
            if a2 not in seen_addr:
                seen_addr.append(a2)
        facts.append("ADDRESSES: " + " | ".join(seen_addr))

    return facts


__all__ = [
    "nigerian_today",
    "DOCUMENT_PROMPTS",
    "detect_document_type",
    "extract_facts",
]
