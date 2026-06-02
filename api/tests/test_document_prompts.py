"""Unit tests for the deterministic helpers in document_prompts.py."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.document_prompts import (
    DOCUMENT_PROMPTS,
    detect_document_type,
    extract_facts,
    nigerian_today,
)


class TestNigerianToday:
    def test_st_suffix(self):
        assert nigerian_today(datetime(2026, 6, 1, tzinfo=timezone.utc)) == "1st June, 2026"

    def test_nd_suffix(self):
        assert nigerian_today(datetime(2026, 6, 2, tzinfo=timezone.utc)) == "2nd June, 2026"

    def test_rd_suffix(self):
        assert nigerian_today(datetime(2026, 6, 3, tzinfo=timezone.utc)) == "3rd June, 2026"

    def test_th_suffix_for_teens(self):
        assert nigerian_today(datetime(2026, 6, 11, tzinfo=timezone.utc)) == "11th June, 2026"
        assert nigerian_today(datetime(2026, 6, 12, tzinfo=timezone.utc)) == "12th June, 2026"
        assert nigerian_today(datetime(2026, 6, 13, tzinfo=timezone.utc)) == "13th June, 2026"

    def test_th_suffix_default(self):
        assert nigerian_today(datetime(2026, 12, 25, tzinfo=timezone.utc)) == "25th December, 2026"


class TestDetectDocumentType:
    @pytest.mark.parametrize(
        "message,expected",
        [
            ("draft an affidavit of loss", "affidavit"),
            ("I need a tenancy agreement for Lagos", "tenancy"),
            ("draft an employment contract", "employment"),
            ("petition for dissolution of marriage", "divorce"),
            ("prepare a deed of assignment", "deed"),
            ("file a petition", "petition"),
            ("motion on notice for bail", "motion"),
            ("writ of summons", "writ"),
            ("notice to quit", "notice"),
            ("legal memorandum on FOI", "memo"),
            ("partnership agreement", "agreement"),
            ("draft a letter of demand", "letter"),
            ("hello world", "agreement"),  # default fallback
        ],
    )
    def test_classifications(self, message: str, expected: str):
        assert detect_document_type(message) == expected

    def test_all_keys_have_prompts(self):
        # Every key returned by detect_document_type must be a DOCUMENT_PROMPTS key.
        for v in {
            "affidavit", "tenancy", "employment", "divorce", "deed",
            "petition", "motion", "writ", "notice", "memo", "agreement", "letter",
        }:
            assert v in DOCUMENT_PROMPTS, f"missing prompt for {v}"


class TestExtractFacts:
    def test_extracts_person_name(self):
        facts = extract_facts("Draft an affidavit for Mr. John Adekunle Smith")
        assert any("John Adekunle Smith" in f for f in facts)

    def test_skips_blocked_phrases(self):
        # "High Court" is a blocklist match — must not appear as a PERSON NAME.
        facts = extract_facts("Application to the High Court of Lagos State")
        names_line = next((f for f in facts if f.startswith("PERSON NAMES")), "")
        assert "High Court" not in names_line
        assert "Lagos State" not in names_line

    def test_extracts_statute_reference(self):
        facts = extract_facts("This is under Section 35 of the CFRN")
        assert any("Section 35" in f for f in facts)

    def test_extracts_amount(self):
        facts = extract_facts("Total owed is ₦5,000,000 for the loan")
        assert any("₦5,000,000" in f for f in facts)

    def test_extracts_court(self):
        facts = extract_facts("file at the Federal High Court of Abuja")
        assert any("Federal High Court" in f for f in facts)

    def test_extracts_detention_duration(self):
        facts = extract_facts("My brother was detained for 3 days at the station")
        assert any("3 days" in f for f in facts)

    def test_extracts_address(self):
        facts = extract_facts("Property at Plot 12 Marina Street, Lagos")
        addr_line = next((f for f in facts if f.startswith("ADDRESSES")), "")
        assert "Plot 12 Marina Street" in addr_line

    def test_empty_message(self):
        assert extract_facts("") == []
