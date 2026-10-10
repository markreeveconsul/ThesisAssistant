"""Shared bounded generation; only validated complete segments reach the client."""

import json
import time
from collections.abc import Iterator

from ollama import Client
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.models import ChatMessage, Conversation, SourceFile
from app.services.rag import NO_EVIDENCE_ANSWER, build_grounded_messages, cited_answer


def event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def ready_evidence(db: Session, project_id: str, evidence: list[dict[str, object]]) -> list[dict[str, object]]:
    ready = set(db.scalars(select(SourceFile.id).where(SourceFile.project_id == project_id, SourceFile.status == "ready")))
    return [chunk for chunk in evidence if chunk.get("file_id") in ready]


def generate_answer(db: Session, conversation: Conversation, question: str, evidence: list[dict[str, object]], *, summary: bool = False) -> Iterator[str]:
    accepted: list[str] = []
    citations: list[dict[str, object]] = []
    pending = ""
    stream = None
    started = time.monotonic()
    received = 0

    def accept(segment: str, section: str | None) -> str | None:
        answer, references = cited_answer(segment, evidence)
        if not references:
            return None
        if section:
            answer = f"{section}: {answer}"
        accepted.append(answer)
        for citation in references:
            if citation not in citations:
                citations.append(citation)
        return event({"type": "token", "text": answer + "\n", "citations": references})

    try:
        yield event({"type": "status", "message": "Checking source evidence"})
        requests = [(None, question)] if not summary else [
            ("Aim", "What was the stated aim or objective of this study?"),
            ("Method", "What research method was used in this study?"),
            ("Findings", "What results or findings did this study report?"),
            ("Limitations", "What limitations did this study explicitly report?"),
        ]
        for section, section_question in requests:
            before = len(accepted)
            pending = ""
            if evidence:
                client = Client(host=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds)
                stream = client.chat(model=settings.ollama_chat_model,
                                     messages=build_grounded_messages(section_question, evidence), stream=True,
                                     options={"temperature": 0, "num_predict": 600 if summary else 1200, "num_ctx": 8192})
                for chunk in stream:
                    if time.monotonic() - started > settings.ollama_timeout_seconds:
                        raise TimeoutError("Response deadline exceeded")
                    fragment = chunk.message.content or ""
                    received += len(fragment)
                    if received > 24000:
                        raise ValueError("Response limit exceeded")
                    pending += fragment
                    while "\n" in pending:
                        segment, pending = pending.split("\n", 1)
                        output = accept(segment, section)
                        if output:
                            yield output
                if pending.strip():
                    output = accept(pending, section)
                    if output:
                        yield output
            if section and len(accepted) == before:
                missing = f"{section}: {NO_EVIDENCE_ANSWER}"
                accepted.append(missing)
                yield event({"type": "token", "text": missing + "\n"})
        answer = "\n".join(accepted) if accepted else NO_EVIDENCE_ANSWER
        db.add_all([
            ChatMessage(conversation_id=conversation.id, role="user", content=question),
            ChatMessage(conversation_id=conversation.id, role="assistant", content=answer, citations_json=json.dumps(citations)),
        ])
        db.commit()
        yield event({"type": "done", "answer": answer, "citations": citations, "conversation_id": conversation.id})
    except Exception:
        db.rollback()
        yield event({"type": "error", "message": "Generation failed or timed out. Check Ollama and retry; this answer was not saved."})
    finally:
        if stream is not None and hasattr(stream, "close"):
            stream.close()
