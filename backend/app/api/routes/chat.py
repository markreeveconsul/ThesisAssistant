"""Project-scoped grounded chat with server-validated citations and SSE."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from ollama import Client
from pydantic import BaseModel, Field

from app.api.deps import DbSession, require_owned_project
from app.core.config import settings
from app.db.session import get_db
from app.models.models import ChatMessage, Conversation, Project
from app.services.rag import NO_EVIDENCE_ANSWER, build_grounded_messages, cited_answer, retrieve_evidence

router = APIRouter()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = None


def _event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/{project_id}/chat")
def chat(
    request: ChatRequest,
    db: DbSession,
    project: Project = Depends(require_owned_project),
) -> StreamingResponse:
    """Retrieve project evidence, stream model chunks, then validate source markers."""
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question must not be blank")

    evidence = retrieve_evidence(project.id, question)
    conversation = None
    if request.conversation_id:
        conversation = db.get(Conversation, request.conversation_id)
        if conversation is None or conversation.project_id != project.id:
            raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation is None:
        conversation = Conversation(project_id=project.id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    messages = build_grounded_messages(question, evidence)
    if evidence:
        client = Client(host=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds)
        stream = client.chat(
            model=settings.ollama_chat_model,
            messages=messages,
            stream=True,
            options={"temperature": 0},
        )
    else:
        stream = ()

    def generate() -> Iterator[str]:
        raw_answer = ""
        if not evidence:
            answer = NO_EVIDENCE_ANSWER
            citations: list[dict[str, str | int]] = []
        else:
            try:
                for chunk in stream:
                    fragment = chunk.message.content or ""
                    raw_answer += fragment
                    yield _event({"type": "token", "text": fragment})
                answer, citations = cited_answer(raw_answer, evidence)
            except Exception:
                yield _event(
                    {"type": "error", "message": "Ollama is unavailable or the response timed out."}
                )
                return
        user_message = ChatMessage(
            conversation_id=conversation.id,
            role="user",
            content=question,
            created_at=datetime.now(UTC),
        )
        assistant_message = ChatMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=answer,
            citations_json=json.dumps(citations, ensure_ascii=False),
            created_at=datetime.now(UTC),
        )
        db.add_all([user_message, assistant_message])
        db.commit()
        yield _event(
            {
                "type": "done",
                "answer": answer,
                "citations": citations,
                "conversation_id": conversation.id,
            }
        )

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
