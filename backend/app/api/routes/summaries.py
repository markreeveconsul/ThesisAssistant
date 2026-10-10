"""Per-document summaries restricted to retrieved project evidence."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from ollama import Client

from app.api.deps import DbSession, require_owned_project
from app.core.config import settings
from app.models.models import ChatMessage, Conversation, Project, SourceFile
from app.db.session import get_db
from app.services.rag import NO_EVIDENCE_ANSWER, build_grounded_messages, cited_answer
from app.services.vector_store import query_project_chunks

router = APIRouter()


@router.post("/{project_id}/files/{file_id}/summary")
def summarize_file(
    db: DbSession,
    project_id: str,
    file_id: str,
    project: Project = Depends(require_owned_project),
) -> StreamingResponse:
    """Summarize only the selected file's indexed excerpts and preserve source locators."""
    source = db.scalar(
        select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id)
    )
    if source is None:
        raise HTTPException(status_code=404, detail="File not found")

    evidence = query_project_chunks(project.id, "aim objectives methodology findings limitations")
    evidence = [chunk for chunk in evidence if chunk.get("file_id") == file_id]
    if not evidence:
        raise HTTPException(status_code=422, detail="The document has no retrievable text to summarize")

    question = (
        f"Summarize the aim, method, findings, and limitations of {source.filename}. "
        "State when any section is not supported by the supplied excerpts."
    )
    client = Client(host=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds)
    stream = client.chat(
        model=settings.ollama_chat_model,
        messages=build_grounded_messages(question, evidence),
        stream=True,
        options={"temperature": 0},
    )
    conversation = Conversation(project_id=project.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    def generate() -> Iterator[str]:
        raw = ""
        try:
            for chunk in stream:
                fragment = chunk.message.content or ""
                raw += fragment
                yield f"data: {json.dumps({'type': 'token', 'text': fragment})}\n\n"
            answer, citations = cited_answer(raw, evidence)
        except Exception:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Ollama is unavailable or the response timed out.'})}\n\n"
            return
        db.add(
            ChatMessage(
                conversation_id=conversation.id,
                role="assistant",
                content=answer,
                citations_json=json.dumps(citations),
                created_at=datetime.now(UTC),
            )
        )
        db.commit()
        yield f"data: {json.dumps({'type': 'done', 'answer': answer, 'citations': citations, 'conversation_id': conversation.id})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
