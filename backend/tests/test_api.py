"""API tests for authentication, isolation, uploads, citations, and cleanup."""

import json
from types import SimpleNamespace
from collections.abc import Iterator
from io import BytesIO

import fitz
import pytest
from ollama import Client as OllamaClient
from sqlalchemy import select

from app.db.session import Base
from app.models.models import ChatMessage, Project, SourceFile, User
from app.services import vector_store
from app.services.vector_store import delete_file_chunks, delete_project_chunks, query_project_chunks, upsert_chunks


@pytest.fixture()
def isolated_vector_store(tmp_path, monkeypatch):
    monkeypatch.setattr(vector_store.settings, "chroma_dir", str(tmp_path / "chroma"))
    monkeypatch.setattr(vector_store.settings, "ollama_base_url", "http://127.0.0.1:11434")
    vector_store.get_collection.cache_clear()

    def embeddings(_self, *, model: str, input: list[str]):
        return SimpleNamespace(embeddings=[[1.0, 0.0, 0.0] if "primary outcome" in text.lower() else [0.0, 1.0, 0.0] for text in input])

    monkeypatch.setattr(OllamaClient, "embed", embeddings)
    yield
    vector_store.get_collection.cache_clear()


def _pdf_bytes(*pages: str) -> bytes:
    document = fitz.open()
    for page_text in pages:
        page = document.new_page()
        page.insert_text((72, 72), page_text)
    result = document.tobytes()
    document.close()
    return result


def test_register_login_and_me_round_trip(client) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "Researcher@Example.org", "password": "scholarly-password-2026"},
    )
    assert response.status_code == 201
    assert response.json()["email"] == "researcher@example.org"
    assert "hashed_password" not in response.json()

    login = client.post(
        "/api/v1/auth/login",
        data={"username": "researcher@example.org", "password": "scholarly-password-2026"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    current = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert current.status_code == 200
    assert current.json()["email"] == "researcher@example.org"


def test_project_api_prevents_cross_user_read_and_list_leaks(client, make_user, auth_headers) -> None:
    owner, owner_token = make_user()
    other, other_token = make_user()
    created = client.post(
        "/api/v1/projects/", headers=auth_headers(owner_token), json={"name": "Private thesis"}
    )
    assert created.status_code == 201
    project_id = created.json()["id"]

    assert client.get(
        f"/api/v1/projects/{project_id}", headers=auth_headers(other_token)
    ).status_code == 404
    assert client.get("/api/v1/projects/", headers=auth_headers(other_token)).json() == []
    assert client.get(
        f"/api/v1/projects/{project_id}/files", headers=auth_headers(other_token)
    ).status_code == 404
    owner_projects = client.get("/api/v1/projects/", headers=auth_headers(owner_token))
    assert [item["id"] for item in owner_projects.json()] == [project_id]


def test_file_delete_removes_local_bytes_and_all_indexed_chunks(
    client, make_user, auth_headers, tmp_path, isolated_vector_store, monkeypatch
) -> None:
    owner, token = make_user()
    monkeypatch.setattr(vector_store.settings, "upload_dir", str(tmp_path / "uploads"))
    project_id = client.post(
        "/api/v1/projects/", headers=auth_headers(token), json={"name": "Removal test"}
    ).json()["id"]
    contents = _pdf_bytes("The primary outcome was recovered sleep duration.")

    uploaded = client.post(
        f"/api/v1/projects/{project_id}/files",
        headers=auth_headers(token),
        files={"file": ("outcomes.pdf", contents, "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    source_id = uploaded.json()["id"]
    stored_path = uploaded.json().get("storage_path")
    assert len(query_project_chunks(project_id, "primary outcome sleep")) > 0

    deleted = client.delete(
        f"/api/v1/projects/{project_id}/files/{source_id}", headers=auth_headers(token)
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}/files", headers=auth_headers(token)).json() == []
    assert query_project_chunks(project_id, "primary outcome sleep") == []
    assert client.delete(
        f"/api/v1/projects/{project_id}/files/{source_id}", headers=auth_headers(token)
    ).status_code == 404


def test_project_delete_cascades_notes_chat_files_and_vectors(
    client, make_user, auth_headers, tmp_path, isolated_vector_store, monkeypatch, test_session_factory
) -> None:
    _owner, token = make_user()
    monkeypatch.setattr(vector_store.settings, "upload_dir", str(tmp_path / "uploads"))
    project_id = client.post(
        "/api/v1/projects/", headers=auth_headers(token), json={"name": "Delete together"}
    ).json()["id"]
    uploaded = client.post(
        f"/api/v1/projects/{project_id}/files",
        headers=auth_headers(token),
        files={"file": ("source.pdf", _pdf_bytes("Study participants were 42 adults."), "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    source_id = uploaded.json()["id"]
    chunks = upsert_chunks
    client.post(
        f"/api/v1/projects/{project_id}/notes",
        headers=auth_headers(token),
        json={"title": "Aim", "content": "Study aim", "citations_json": "[]"},
    )
    project = client.get(f"/api/v1/projects/{project_id}", headers=auth_headers(token))
    assert project.status_code == 200
    source_paths = list((tmp_path / "uploads" / project_id).glob("*"))
    assert source_paths
    assert query_project_chunks(project_id, "study participants")

    response = client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers(token))
    assert response.status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}", headers=auth_headers(token)).status_code == 404
    assert all(not path.exists() for path in source_paths)
    assert query_project_chunks(project_id, "study participants") == []
    db = test_session_factory()
    try:
        assert db.scalar(select(Project).where(Project.id == project_id)) is None
        assert db.scalar(select(SourceFile).where(SourceFile.id == source_id)) is None
    finally:
        db.close()


def test_upload_chat_and_saved_citation_end_to_end(
    client, make_user, auth_headers, tmp_path, isolated_vector_store, monkeypatch
) -> None:
    _user, token = make_user()
    monkeypatch.setattr(vector_store.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(vector_store.settings, "min_relevance_distance", 2.0)
    project_id = client.post(
        "/api/v1/projects/", headers=auth_headers(token), json={"name": "Sleep outcomes"}
    ).json()["id"]
    uploaded = client.post(
        f"/api/v1/projects/{project_id}/files",
        headers=auth_headers(token),
        files={
            "file": (
                "trial-results.pdf",
                _pdf_bytes("The primary outcome was mean nightly sleep duration.", "The trial found sleep duration increased by 38 minutes."),
                "application/pdf",
            )
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["id"]

    class ChatChunk:
        def __init__(self, content: str):
            self.message = type("MessagePart", (), {"content": content})()

    fake_model_answer = "The primary outcome was mean nightly sleep duration [1]."
    monkeypatch.setattr(
        "app.api.routes.chat.Client.chat",
        lambda *_args, **_kwargs: iter(ChatChunk(piece) for piece in [fake_model_answer[:24], fake_model_answer[24:]]),
    )
    result = client.post(
        f"/api/v1/projects/{project_id}/chat",
        headers=auth_headers(token),
        json={"question": "What was the primary outcome?"},
    )
    assert result.status_code == 200
    done = json.loads(result.text.strip().split("\n\n")[-1].removeprefix("data: "))
    assert done["type"] == "done"
    assert done["citations"] == [{"filename": "trial-results.pdf", "page": 1, "evidence_id": "1"}]
    assert "[trial-results.pdf, p. 1]" in done["answer"]

    monkeypatch.setattr(vector_store.settings, "min_relevance_distance", -1.0)
    absent = client.post(
        f"/api/v1/projects/{project_id}/chat",
        headers=auth_headers(token),
        json={"question": "What was the color of the facility?"},
    )
    assert absent.status_code == 200
    absent_done = json.loads(absent.text.strip().split("\n\n")[-1].removeprefix("data: "))
    assert absent_done["answer"] == "I can't find this in your documents."
    assert absent_done["citations"] == []

    saved = client.post(
        f"/api/v1/projects/{project_id}/notes",
        headers=auth_headers(token),
        json={
            "title": "Primary outcome",
            "content": done["answer"],
            "citations_json": json.dumps(done["citations"]),
        },
    )
    assert saved.status_code == 201
    assert json.loads(saved.json()["citations_json"]) == done["citations"]
    file_id = uploaded.json()["id"]
    assert client.get(f"/api/v1/projects/{project_id}/files", headers=auth_headers(token)).json()[0]["id"] == file_id


def test_corrupt_and_unsupported_uploads_fail_safely(client, make_user, auth_headers) -> None:
    _, token = make_user()
    project_id = client.post(
        "/api/v1/projects/", headers=auth_headers(token), json={"name": "Invalid uploads"}
    ).json()["id"]
    corrupt = client.post(
        f"/api/v1/projects/{project_id}/files",
        headers=auth_headers(token),
        files={"file": ("damaged.pdf", b"%PDF-not-a-real-document", "application/pdf")},
    )
    assert corrupt.status_code == 422
    unsupported = client.post(
        f"/api/v1/projects/{project_id}/files",
        headers=auth_headers(token),
        files={"file": ("script.py", b"print('not a source')", "text/plain")},
    )
    assert unsupported.status_code == 415


def test_project_deletion_works_when_project_has_never_had_vectors(
    client, make_user, auth_headers, isolated_vector_store
) -> None:
    _, token = make_user()
    project_id = client.post(
        "/api/v1/projects/", headers=auth_headers(token), json={"name": "Empty vectors"}
    ).json()["id"]
    assert client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers(token)).status_code == 204


def test_auth_rejects_duplicate_email_bad_password_and_invalid_token(client):
    payload = {"email": "Reader@example.org", "password": "long-enough-password"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert client.post("/api/v1/auth/register", json={**payload, "email": "reader@example.org"}).status_code == 409
    assert client.post("/api/v1/auth/login", data={"username": payload["email"], "password": "wrong"}).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert client.get("/api/v1/projects/").status_code == 401


def test_nested_routes_reject_other_users(client, make_user, auth_headers):
    _, owner = make_user()
    _, stranger = make_user()
    project = client.post("/api/v1/projects/", headers=auth_headers(owner), json={"name": "Private"}).json()["id"]
    from uuid import uuid4
    file_id = str(uuid4())
    root = f"/api/v1/projects/{project}"
    for method, path, body in [
        ("POST", "/chat", {"question": "What is private?"}),
        ("POST", f"/files/{file_id}/summary", None),
        ("DELETE", f"/files/{file_id}", None),
        ("DELETE", "", None),
        ("GET", "/notes", None),
        ("POST", "/notes", {"title": "Private", "content": "private"}),
    ]:
        assert client.request(method, root + path, headers=auth_headers(stranger), json=body).status_code == 404
    assert client.post(root + "/files", headers=auth_headers(stranger), files={"file": ("private.txt", b"private")}).status_code == 404


def test_index_failure_cleans_up_and_allows_retry(client, make_user, auth_headers, monkeypatch, isolated_vector_store, tmp_path):
    _, token = make_user()
    headers = auth_headers(token)
    project = client.post("/api/v1/projects/", headers=headers, json={"name": "Recovery"}).json()["id"]
    from app.api.routes import files
    original = files.upsert_chunks
    def fail(*args):
        raise ConnectionError("offline")
    monkeypatch.setattr(files, "upsert_chunks", fail)
    path = f"/api/v1/projects/{project}/files"
    assert client.post(path, headers=headers, files={"file": ("retry.txt", b"research evidence")}).status_code == 503
    assert client.get(path, headers=headers).json() == []
    assert not list((tmp_path / "uploads").rglob("*.txt"))
    monkeypatch.setattr(files, "upsert_chunks", original)
    assert client.post(path, headers=headers, files={"file": ("retry.txt", b"research evidence")}).status_code == 201


def test_vector_query_filters_project_and_document_before_top_k(isolated_vector_store, monkeypatch):
    monkeypatch.setattr(vector_store.settings, "retrieval_top_k", 1)
    monkeypatch.setattr(vector_store.settings, "min_relevance_distance", 2.0)
    for project, file_id in [("a", "one"), ("a", "two"), ("b", "private")]:
        upsert_chunks([{"id": file_id, "text": "primary outcome", "filename": file_id + ".pdf", "page": 2}], project, file_id)
    results = query_project_chunks("a", "primary outcome", "two")
    assert len(results) == 1
    assert results[0]["project_id"] == "a" and results[0]["file_id"] == "two"
    monkeypatch.setattr(vector_store.settings, "ollama_embed_model", "changed-model")
    with pytest.raises(RuntimeError, match="reindex"):
        query_project_chunks("a", "primary outcome")


def test_source_access_is_private_and_locator_matches(client, make_user, auth_headers, isolated_vector_store):
    _, token = make_user()
    _, stranger = make_user()
    headers = auth_headers(token)
    project = client.post("/api/v1/projects/", headers=headers, json={"name": "Sources"}).json()["id"]
    root = f"/api/v1/projects/{project}/files"
    file_id = client.post(root, headers=headers, files={"file": ("source.txt", b"first\\n\\nthird")}).json()["id"]
    assert client.get(f"{root}/{file_id}/content", headers=headers).content == b"first\\n\\nthird"
    assert client.get(f"{root}/{file_id}/content", headers=auth_headers(stranger)).status_code == 404
    assert client.get(f"{root}/{file_id}/locator/1", headers=headers).json()["locator_type"] == "line"
    assert client.get(f"{root}/{file_id}/locator/1", headers=auth_headers(stranger)).status_code == 404
