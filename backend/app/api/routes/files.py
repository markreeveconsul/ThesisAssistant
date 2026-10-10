"""User-isolated file upload, indexing and deletion endpoints."""

import hashlib
from pathlib import Path
import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.api.deps import DbSession, require_owned_project
from app.core.config import settings
from app.models.models import Project, SourceFile
from app.schemas import FileRead
from app.services.chunking import chunk_pages
from app.services.parsing import extract_pages
from app.services.vector_store import delete_file_chunks, upsert_chunks

router = APIRouter()
_ALLOWED = {".pdf", ".docx", ".txt"}
_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._ -]+")


def safe_filename(filename: str) -> str:
    """Remove paths, controls, and unsafe Unicode separators from client filenames."""
    basename = Path(filename.replace("\\", "/")).name.strip()
    safe = _SAFE_FILENAME.sub("_", basename).strip(" ._")
    return (safe or "source")[:200]


@router.get("/{project_id}/files", response_model=list[FileRead])
def list_files(
    db: DbSession,
    project: Project = Depends(require_owned_project),
) -> list[SourceFile]:
    return list(
        db.scalars(
            select(SourceFile)
            .where(SourceFile.project_id == project.id)
            .order_by(SourceFile.created_at.desc())
        )
    )



@router.post("/{project_id}/files", response_model=FileRead, status_code=status.HTTP_201_CREATED)
def upload_file(
    db: DbSession,
    file: UploadFile = File(...),
    project: Project = Depends(require_owned_project),
) -> SourceFile:
    filename = safe_filename(file.filename or "source")
    extension = Path(filename).suffix.lower()
    if extension not in _ALLOWED:
        raise HTTPException(status_code=415, detail="Only PDF, DOCX, and TXT files are accepted")

    content = file.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Maximum upload size is {settings.max_upload_mb} MB")

    actual_type = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".txt": "text/plain",
    }[extension]
    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="The file content does not match the PDF extension")
    if extension == ".docx" and not content.startswith(b"PK"):
        raise HTTPException(status_code=415, detail="The file content does not match the DOCX extension")

    digest = hashlib.sha256(content).hexdigest()
    exists = db.scalar(
        select(SourceFile).where(SourceFile.project_id == project.id, SourceFile.sha256 == digest)
    )
    if exists is not None:
        raise HTTPException(status_code=409, detail="This file is already uploaded to the project")

    pages, warning = extract_pages(filename, content)
    chunks = chunk_pages(pages, filename)
    file_id = str(uuid4())
    directory = (settings.resolved_upload_dir / project.id).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    storage_path = directory / f"{file_id}{extension}"
    source = SourceFile(
        id=file_id,
        project_id=project.id,
        filename=filename,
        storage_path=str(storage_path),
        content_type=actual_type,
        sha256=digest,
        status="processing",
        warning=warning,
    )
    db.add(source)
    db.commit()

    try:
        storage_path.write_bytes(content)
        upsert_chunks(chunks, project.id, file_id)
    except Exception as exc:
        db.rollback()
        delete_file_chunks(file_id)
        storage_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=503,
            detail="Document indexing failed. Confirm Ollama and both configured models are available.",
        ) from exc

    source.status = "ready"
    db.commit()
    db.refresh(source)
    return source


@router.delete("/{project_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    db: DbSession,
    file_id: str,
    project: Project = Depends(require_owned_project),
) -> None:
    source = db.scalar(
        select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id)
    )
    if source is None:
        raise HTTPException(status_code=404, detail="File not found")
    delete_file_chunks(file_id)
    Path(source.storage_path).unlink(missing_ok=True)
    db.delete(source)
    db.commit()
