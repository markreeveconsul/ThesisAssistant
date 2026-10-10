"""Owner-scoped chat and persisted conversation history."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DbSession, require_owned_project
from app.models.models import ChatMessage, Conversation, Project
from app.services.generation import generate_answer, ready_evidence
from app.services.rag import retrieve_evidence

router = APIRouter()


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=8000)
    conversation_id: str | None = None


@router.post("/{project_id}/chat")
def chat(request: ChatRequest, db: DbSession, project: Project = Depends(require_owned_project)) -> StreamingResponse:
    question = request.question.strip()
    if not question:
        raise HTTPException(422, "Question must not be blank")
    conversation = db.get(Conversation, request.conversation_id) if request.conversation_id else None
    if request.conversation_id and (conversation is None or conversation.project_id != project.id):
        raise HTTPException(404, "Conversation not found")
    try:
        evidence = ready_evidence(db, project.id, retrieve_evidence(project.id, question))
    except Exception as exc:
        raise HTTPException(503, "Retrieval unavailable. Check Ollama, the embedding model, and whether the index needs rebuilding.") from exc
    if conversation is None:
        conversation = Conversation(project_id=project.id)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    return StreamingResponse(generate_answer(db, conversation, question, evidence), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/{project_id}/history")
def history(db: DbSession, project: Project = Depends(require_owned_project)) -> list[dict[str, object]]:
    messages = db.scalars(select(ChatMessage).join(Conversation).where(Conversation.project_id == project.id).order_by(ChatMessage.created_at, ChatMessage.id))
    return [{"role": message.role, "content": message.content, "citations": json.loads(message.citations_json or "[]")} for message in messages]
