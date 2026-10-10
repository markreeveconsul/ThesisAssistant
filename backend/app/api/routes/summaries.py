"""Document-filtered summaries using the same validated stream as chat."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.api.deps import DbSession, require_owned_project
from app.models.models import Conversation, Project, SourceFile
from app.services.generation import generate_answer, ready_evidence
from app.services.vector_store import query_project_chunks

router = APIRouter()


@router.post("/{project_id}/files/{file_id}/summary")
def summarize_file(file_id: str, db: DbSession, project: Project = Depends(require_owned_project)) -> StreamingResponse:
    source = db.scalar(select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id, SourceFile.status == "ready"))
    if source is None:
        raise HTTPException(404, "Ready source file not found")
    try:
        evidence = []
        for section in ("aim objectives", "method participants procedure", "findings results", "limitations"):
            for chunk in query_project_chunks(project.id, section, file_id):
                if chunk not in evidence:
                    evidence.append(chunk)
        evidence = ready_evidence(db, project.id, evidence)
        # Keep the evidence within the local model's context budget.
        import tiktoken
        encoder = tiktoken.get_encoding("cl100k_base")
        budget = 5500
        bounded = []
        for chunk in evidence:
            size = len(encoder.encode(str(chunk["text"]), disallowed_special=()))
            if size <= budget:
                bounded.append(chunk)
                budget -= size
        evidence = bounded
    except Exception as exc:
        raise HTTPException(503, "Summary retrieval unavailable. Check Ollama and the embedding index.") from exc
    question = "Summarize this document's aim, method, findings, and limitations. Prefix each supported sentence with its section name. Omit unsupported sections; never infer missing details."
    conversation = Conversation(project_id=project.id)
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return StreamingResponse(generate_answer(db, conversation, question, evidence, summary=True), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
