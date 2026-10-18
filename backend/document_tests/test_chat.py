import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from document_service import chat
from document_service.ai_provider import ProviderError
from document_service.main import app
from document_service.retrieval import Question, chunks, quote_options, retrieve
from document_service import semantic_retrieval


def payload(question="What method did the study use?"):
    return {"project_id": "p1", "question": question, "sources": [{
        "id": "s1", "project_id": "p1", "filename": "study.pdf", "pages": [
            {"page_number": 1, "locator_type": "page", "text": "The aim was to understand learning."},
            {"page_number": 2, "locator_type": "page", "text": "The study method was interviews. Funding was not reported."},
        ],
    }]}


def test_chunk_overlap_and_location_preservation():
    words = [str(i) for i in range(1100)]
    parts = chunks(" ".join(words))
    assert len(parts[0].split()) == 600
    assert parts[0].split()[-80:] == parts[1].split()[:80]
    evidence = retrieve(Question.model_validate(payload()))
    assert evidence[0]["location"] == 2
    assert evidence[0]["source_id"] == "s1"


def test_cross_project_payload_rejected():
    data = payload(); data["sources"][0]["project_id"] = "other"
    with pytest.raises(ValidationError):
        Question.model_validate(data)


def test_follow_up_retrieval_uses_previous_question_only_when_current_is_ambiguous():
    data = payload("Can you explain that more?")
    data["history"] = [
        {"role": "user", "content": "What interview results did the study report?"},
        {"role": "assistant", "content": "The study reports interview results."},
    ]
    follow_up = Question.model_validate(data)
    assert "interview results" in follow_up.retrieval_query
    data["question"] = "What limitations did the authors report?"
    specific = Question.model_validate(data)
    assert specific.retrieval_query == data["question"]


def test_history_accepts_long_replies_but_rejects_oversized_turns():
    data = payload("Can you clarify that?")
    data["history"] = [{"role": "assistant", "content": "x" * 2500}]
    assert len(Question.model_validate(data).history[0].content) == 2500
    data["history"][0]["content"] += "x"
    with pytest.raises(ValidationError):
        Question.model_validate(data)

    data["history"] = [
        {"role": "assistant", "content": "x" * 2500} for _ in range(4)
    ]
    assert len(Question.model_validate(data).history) == 4


def test_no_keyword_match_retrieves_nothing():
    assert retrieve(Question.model_validate(payload("Which telescope observed Jupiter?"))) == []


@pytest.mark.parametrize(("question", "text"), [
    ("What methods did the sources use?", "Data were gathered through semi-structured interviews."),
    ("How did the researchers carry out the study?", "Data were gathered through semi-structured interviews."),
    ("What was the research approach?", "A qualitative design was adopted for the project."),
    ("How was the data collected?", "The researchers conducted semi-structured interviews."),
    ("What did the authors find?", "The program significantly improved reading scores."),
    ("Who participated in the project?", "Students were recruited from three local schools."),
    ("What evidence can I use in my thesis?", "The findings showed that feedback improved student engagement."),
])
def test_academic_paraphrases_retrieve_matching_evidence(question, text):
    data = payload(question)
    data["sources"][0]["pages"] = [{"page_number": 4, "locator_type": "page", "text": text}]
    evidence = retrieve(Question.model_validate(data))
    assert evidence
    assert evidence[0]["location"] == 4
    assert any(item["text"] == text for item in quote_options(evidence))


def test_search_ignores_case_and_does_not_require_exact_phrasing():
    data = payload("WHAT METHODS DID THE SOURCES USE?")
    data["sources"][0]["pages"] = [{
        "page_number": 5,
        "locator_type": "page",
        "text": "Researchers gathered data through semi-structured interviews.",
    }]
    evidence = retrieve(Question.model_validate(data))
    assert evidence
    assert quote_options(evidence)[0]["text"] == (
        "Researchers gathered data through semi-structured interviews."
    )


def test_quote_options_do_not_cut_sentences_at_chunk_boundaries():
    data = payload()
    data["sources"][0]["pages"][1]["text"] = "The study " + "method " * 700 + "did not succeed."
    assert quote_options(retrieve(Question.model_validate(data))) == []


@pytest.mark.parametrize("raw", [
    '{"evidence_ids":["invented"],"answer":"Claim."}',
    '{"evidence_ids":"Q1","answer":"Claim."}',
    '{"evidence_ids":["Q1"],"answer":"Claim.","extra":"field"}',
    '{"evidence_ids":["Q1","Q1","Q1","Q1"],"answer":"Claim."}',
    '{"evidence_ids":["Q1"]}',
    "not json",
])
def test_invalid_answers_or_citations_fail_closed(raw):
    assert chat.validate_answer(raw, [{"id": "Q1", "text": "Original."}]) is None


def test_valid_answer_uses_original_text_and_location():
    options = quote_options(retrieve(Question.model_validate(payload())))
    result = chat.validate_answer(
        '{"answer":"The researchers used interviews.","evidence_ids":["Q1","Q1"]}',
        options,
    )
    assert result["answer"] == "The researchers used interviews."
    assert len(result["evidence"]) == 1
    assert result["evidence"][0]["text"] == "The study method was interviews."
    assert result["evidence"][0]["location"] == 2


def test_empty_evidence_becomes_the_exact_abstention():
    result = chat.validate_answer(
        '{"answer":"I am not sure.","evidence_ids":[]}',
        [{"id": "Q1", "text": "Original."}],
    )
    assert result == {"answer": chat.ABSTENTION, "evidence": []}


def test_hybrid_retrieval_keeps_semantic_and_adds_distinct_keyword_evidence():
    semantic = [
        (0.9, {"source_id": "s1", "location": 1, "text": "Semantic match."}),
        (0.8, {"source_id": "s1", "location": 2, "text": "Second semantic match."}),
    ]
    keywords = [
        {"source_id": "s1", "location": 2, "text": "Second semantic match."},
        {"source_id": "s1", "location": 3, "text": "Keyword match."},
    ]
    merged = semantic_retrieval._combine_matches(semantic, keywords, top_k=3)
    assert [item["text"] for item in merged] == [
        "Semantic match.", "Second semantic match.", "Keyword match."
    ]
    assert [item["id"] for item in merged] == ["E1", "E2", "E3"]
    assert merged[0]["similarity"] == 0.9


def events(response):
    assert response.status_code == 200
    return [json.loads(line) for line in response.text.splitlines()]


def test_chat_health_reports_provider_fallbacks():
    with TestClient(app) as client:
        response = client.get("/chat/health")
    assert response.json() == {
        "status": "ok",
        "provider": "gemini",
        "provider_fallbacks": False,
        "chat_contract": "bounded-history-v2",
    }


def test_chat_stream_and_provider_prompt(monkeypatch):
    monkeypatch.setattr(chat.ChatConfig, "from_env", lambda: None)

    async def retrieval(question):
        return retrieve(question)

    async def completion(config, client, messages):
        evidence = json.loads(messages[1]["content"])
        assert "untrusted" in messages[0]["content"]
        assert "filename" not in evidence["evidence"][0]
        assert "natural, clear language" in messages[0]["content"]
        return '{"answer":"The study used interviews.","evidence_ids":["Q1"]}'
    monkeypatch.setattr(chat, "retrieve_sources", retrieval)
    monkeypatch.setattr(chat, "complete", completion)
    with TestClient(app, headers={"origin": "http://127.0.0.1:3002"}) as client:
        result = events(client.post("/chat", json=payload()))
    answer = next(item["message"] for item in result if item["type"] == "answer")
    assert answer == "The study used interviews."
    citation = next(item["citation"] for item in result if item["type"] == "citation")
    assert citation == {"source_id": "s1", "filename": "study.pdf", "location": 2,
                        "locator_type": "page", "text": "The study method was interviews."}
    assert result[-1]["type"] == "done"


def test_no_sources_abstains_without_provider(monkeypatch):
    async def retrieval(question):
        return []

    async def must_not_call(*args):
        raise AssertionError("No provider call expected")
    monkeypatch.setattr(chat, "retrieve_sources", retrieval)
    monkeypatch.setattr(chat, "answer_from_sources", must_not_call)
    with TestClient(app, headers={"origin": "http://127.0.0.1:3002"}) as client:
        data = payload(); data["sources"] = []
        result = events(client.post("/chat", json=data))
    assert result[-2] == {"type": "abstention", "message": chat.ABSTENTION}


def test_rate_limit_is_an_error_not_an_answer(monkeypatch):
    async def retrieval(question):
        return retrieve(question)

    async def fail(*args):
        raise ProviderError("Rate limit reached.")
    monkeypatch.setattr(chat, "retrieve_sources", retrieval)
    monkeypatch.setattr(chat, "answer_from_sources", fail)
    with TestClient(app, headers={"origin": "http://127.0.0.1:3002"}) as client:
        result = events(client.post("/chat", json=payload()))
    assert result[-1] == {"type": "error", "message": "Rate limit reached."}
    assert not any(item["type"] == "citation" for item in result)


def test_chat_request_boundaries():
    with TestClient(app, headers={"origin": "http://127.0.0.1:3002"}) as client:
        data = payload(); data["sources"][0]["project_id"] = "other"
        assert client.post("/chat", json=data).status_code == 422
        assert client.post("/chat", content=b"x" * 10_000_001).status_code == 413
        assert client.post("/chat", json=payload(), headers={"origin": "https://attacker.example"}).status_code == 403


def test_semantic_retrieval_finds_paraphrase_and_caches_document_vectors(monkeypatch):
    semantic_retrieval.clear_embedding_cache()
    data = payload("How did the researchers gather information?")
    data["sources"][0]["pages"] = [
        {"page_number": 7, "locator_type": "page", "text": "Participants completed a structured survey."},
        {"page_number": 8, "locator_type": "page", "text": "A telescope observed Jupiter and Saturn."},
    ]
    question = Question.model_validate(data)
    calls = []

    async def fake_embeddings(config, client, texts, task, titles=None):
        calls.append(task)
        if task == "QUESTION_ANSWERING":
            return [[1.0, 0.0]]
        return [[1.0, 0.0] if "survey" in text else [0.0, 1.0] for text in texts]

    monkeypatch.setattr(semantic_retrieval, "embed_texts", fake_embeddings)

    async def retrieve_twice():
        import httpx
        async with httpx.AsyncClient() as client:
            config = chat.ChatConfig(
                key="test", embedding_model="test-embed", embedding_dimensions=2,
                minimum_similarity=0.3,
            )
            first = await semantic_retrieval.retrieve_semantic(question, config, client)
            second = await semantic_retrieval.retrieve_semantic(question, config, client)
            return first, second

    first, second = asyncio.run(retrieve_twice())
    assert first[0]["location"] == 7
    assert first[0]["source_id"] == "s1"
    assert first[0]["similarity"] == pytest.approx(1.0)
    assert quote_options(first)[0]["text"] == "Participants completed a structured survey."
    assert second[0]["location"] == 7
    assert calls == ["RETRIEVAL_DOCUMENT", "QUESTION_ANSWERING", "QUESTION_ANSWERING"]
    semantic_retrieval.clear_embedding_cache()
