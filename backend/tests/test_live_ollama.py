"""Opt-in integration test using real local Ollama embeddings and chat."""

import json
import os

import fitz
import pytest

from app.services import vector_store

pytestmark = pytest.mark.skipif(os.environ.get("RUN_OLLAMA_TESTS") != "1", reason="Set RUN_OLLAMA_TESTS=1 with Ollama running")


def pdf(*texts: str) -> bytes:
    with fitz.open() as document:
        for text in texts:
            page = document.new_page()
            page.insert_textbox(fitz.Rect(60, 60, 540, 760), text)
        return document.tobytes()


def final_event(response):
    assert response.status_code == 200, response.text
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    assert events[-1]["type"] == "done", events
    return events[-1]


def test_real_three_pdf_question_citations_and_abstention(client, make_user, auth_headers):
    vector_store.get_collection.cache_clear()
    _, token = make_user()
    headers = auth_headers(token)
    root = "/api/v1/projects/" + client.post("/api/v1/projects/", headers=headers, json={"name": "Live Ollama acceptance"}).json()["id"]
    try:
        sources = [
            ("trial.pdf", pdf("The sleep trial studied 42 adults over six weeks.", "The trial found that mean nightly sleep duration increased by 38 minutes. No funding amount was reported.")),
            ("methods.pdf", pdf("The method was a randomized controlled trial using sleep diaries.")),
            ("limitations.pdf", pdf("Limitations were the small sample size and short follow-up period.")),
        ]
        file_ids = {}
        for name, data in sources:
            response = client.post(root + "/files", headers=headers, files={"file": (name, data, "application/pdf")})
            assert response.status_code == 201, response.text
            file_ids[name] = response.json()["id"]
        response = client.post(root + "/chat", headers=headers, json={"question": "By how many minutes did mean nightly sleep duration increase in the trial?"})
        done = final_event(response)
        assert "38" in done["answer"], done
        assert any(citation["file_id"] == file_ids["trial.pdf"] and citation["page"] == 2 for citation in done["citations"]), done
        assert '"type": "token"' in response.text
        absent = final_event(client.post(root + "/chat", headers=headers, json={"question": "What was the exact funding amount in US dollars for this trial?"}))
        assert absent["answer"] == "I can't find this in your documents.", absent
        assert absent["citations"] == []
        summary = final_event(client.post(root + "/files/" + file_ids["methods.pdf"] + "/summary", headers=headers))
        assert "Method: The method was a randomized controlled trial using sleep diaries." in summary["answer"], summary
        assert "Aim: I can't find this in your documents." in summary["answer"], summary
        assert all(citation["file_id"] == file_ids["methods.pdf"] for citation in summary["citations"]), summary
    finally:
        client.delete(root, headers=headers)
        vector_store.get_collection.cache_clear()
