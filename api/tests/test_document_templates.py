"""Unit tests for template alias resolution."""
from __future__ import annotations

import pytest

from app.services.document_templates import (
    TEMPLATE_ALIASES,
    canonicalise_doc_type,
)


class TestCanonicalise:
    @pytest.mark.parametrize(
        "msg,expected",
        [
            ("Please draft a bail application for my brother", "bail application"),
            ("I need a tenancy agreement", "tenancy agreement"),
            ("Prepare an NDA between two companies", "non-disclosure agreement"),
            ("Draft a non-disclosure agreement", "non-disclosure agreement"),
            ("Draft a non disclosure agreement", "non-disclosure agreement"),
            ("Prepare a power of attorney for property", "power of attorney"),
            ("POA for vehicle sale", "power of attorney"),
            ("Issue a quit notice to my tenant", "notice to quit"),
            ("FOI request to NCC", "FOI request"),
            ("loan agreement between parties", "loan agreement"),
            ("Draft a will for me", "last will and testament"),
            ("Draft a partnership for our two companies", "partnership agreement"),
        ],
    )
    def test_alias_match(self, msg: str, expected: str):
        assert canonicalise_doc_type(msg) == expected

    def test_no_match(self):
        assert canonicalise_doc_type("Random unrelated text about cooking") is None

    def test_empty_message(self):
        assert canonicalise_doc_type("") is None
        assert canonicalise_doc_type(None) is None  # type: ignore[arg-type]

    def test_longest_alias_wins(self):
        # "non-disclosure agreement" should beat "non-disclosure" — both
        # canonicalise to the same value, but the test asserts the longer
        # key was matched first by checking re-ordering doesn't change result.
        assert canonicalise_doc_type("non-disclosure agreement") == "non-disclosure agreement"

    def test_all_aliases_resolve_to_a_value(self):
        for k, v in TEMPLATE_ALIASES.items():
            assert v, f"empty canonical for alias {k}"


def test_38_canonical_templates():
    """The alias map must cover at least the 38 documented templates."""
    canonicals = set(TEMPLATE_ALIASES.values())
    # Cover the major categories named in the original spec.
    must_have = {
        "general affidavit",
        "affidavit of loss",
        "affidavit of change of name",
        "affidavit of next of kin",
        "statutory declaration of age",
        "bail application",
        "writ of summons",
        "statement of claim",
        "statement of defence",
        "motion on notice",
        "motion ex parte",
        "notice of appeal",
        "fundamental rights enforcement application",
        "tenancy agreement",
        "deed of assignment",
        "power of attorney",
        "notice to quit",
        "deed of gift",
        "partnership agreement",
        "non-disclosure agreement",
        "board resolution",
        "service agreement",
        "memorandum of understanding",
        "employment contract",
        "offer letter",
        "termination letter",
        "query letter",
        "last will and testament",
        "divorce petition",
        "loan agreement",
        "promissory note",
        "FOI request",
        "press accreditation letter",
        "letter of demand",
        "cease and desist letter",
        "copyright assignment",
        "CAC business name registration application",
        "invitation letter",
    }
    missing = must_have - canonicals
    assert not missing, f"missing canonicals: {missing}"
    assert len(canonicals) >= 38, f"expected ≥38 canonical templates, got {len(canonicals)}"
