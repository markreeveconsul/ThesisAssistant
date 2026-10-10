"""Tests for evidence selection, citation validation and safe chat fallbacks."""

from app.services.rag import (
    NO_EVIDENCE_ANSWER,
    build_grounded_messages,
    cited_answer,
    resolve_citations,
)


def _source(filename: str = "Study.pdf", page: int = 3) -> dict[str, object]:
    return {"text": "Participants were assigned at random.", "filename": filename, "page": page}


def test_resolve_citations_uses_only_valid_evidence_markers() -> None:
    citations = resolve_citations("Supported [2]; fabricated [99].", [_source(), _source("Methods.pdf", 8)])
    assert citations == [{"filename": "Methods.pdf", "page": 8, "evidence_id": "2", "file_id": "", "locator_type": "page"}]


def test_cited_answer_formats_real_source_and_page() -> None:
    answer, citations = cited_answer("Participants were assigned randomly [1].", [_source()])
    assert "[Study.pdf, p. 3]" in answer
    assert citations[0]["page"] == 3


def test_uncited_or_unsupported_completion_returns_no_evidence_answer() -> None:
    assert cited_answer("The study had excellent outcomes.", [_source()]) == (NO_EVIDENCE_ANSWER, [])
    assert cited_answer("Invented result [22].", [_source()]) == (NO_EVIDENCE_ANSWER, [])
    assert cited_answer("Anything [1].", []) == (NO_EVIDENCE_ANSWER, [])


def test_prompt_marks_document_as_untrusted_and_demands_citations() -> None:
    prompt = build_grounded_messages("Summarize the methods", [_source()])
    assert "untrusted" in prompt[0]["content"]
    assert "bracketed evidence number" in prompt[0]["content"]
    assert '"evidence_id": 1' in prompt[1]["content"]


def test_valid_marker_does_not_rescue_invented_or_uncited_claim():
    for answer in ("Supported [1]. Invented [99].", "Invented fact. Supported [1].", "Supported [1] and fabricated [abc]."):
        assert cited_answer(answer, [_source()]) == (NO_EVIDENCE_ANSWER, [])


def test_non_pdf_citations_use_honest_locators():
    answer, citations = cited_answer("The study used random assignment [1].", [{**_source(), "locator_type": "paragraph", "file_id": "file"}])
    assert "paragraph 3" in answer
    assert citations[0]["file_id"] == "file"
