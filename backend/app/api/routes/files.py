"""User-isolated file upload, indexing and deletion endpoints."""

import hashlib
import re
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_owned_project
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Project, SourceFile, User
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
    db: Annotated[Session, Depends(get_db)],
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[SourceFile]:
    project = get_owned_project(project_id, current_user.id, db)
    return list(
        db.scalars(
            select(SourceFile)
            .where(SourceFile.project_id == project.id)
            .order_by(SourceFile.created_at.desc())
        )
    )



@router.post("/{project_id}/files", response_model=FileRead, status_code=status.HTTP_201_CREATED)
def upload_file(
    db: Annotated[Session, Depends(get_db)],
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    file: UploadFile = File(...),
) -> SourceFile:
    project = get_owned_project(project_id, current_user.id, db)
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
        if exists.status != "failed":
            raise HTTPException(status_code=409, detail="This file is already uploaded to the project")
        try:
            delete_file_chunks(exists.id)
            Path(exists.storage_path).unlink(missing_ok=True)
        except Exception as exc:
            raise HTTPException(503, "Previous indexing cleanup failed; retry later") from exc
        db.delete(exists)
        db.commit()

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
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This file is already uploaded to the project") from exc

    try:
        storage_path.write_bytes(content)
        upsert_chunks(chunks, project.id, file_id)
    except Exception as exc:
        db.rollback()
        source.status = "failed"
        db.commit()
        try:
            delete_file_chunks(file_id)
            storage_path.unlink(missing_ok=True)
        except Exception:
            # Retain the failed row so deletion/retry can find any residual data.
            pass
        else:
            db.delete(source)
            db.commit()
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
    db: Annotated[Session, Depends(get_db)],
    project_id: str,
    file_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    project = get_owned_project(project_id, current_user.id, db)
    source = db.scalar(
        select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id)
    )
    if source is None:
        raise HTTPException(status_code=404, detail="File not found")
    if source.status == "processing":
        raise HTTPException(409, "Wait for indexing to finish before deleting this file")
    source.status = "deleting"
    db.commit()
    try:
        delete_file_chunks(file_id)
        Path(source.storage_path).unlink(missing_ok=True)
    except Exception as exc:
        raise HTTPException(503, "File cleanup failed; retry deletion") from exc
    db.delete(source)
    db.commit()


@router.get("/{project_id}/files/{file_id}/content")
def read_source_content(project_id: str, file_id: str, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]) -> FileResponse:
    project = get_owned_project(project_id, current_user.id, db)
    source = db.scalar(select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id))
    if source is None or source.status != "ready" or not Path(source.storage_path).is_file():
        raise HTTPException(404, "Source file is unavailable")
    return FileResponse(source.storage_path, media_type=source.content_type, filename=source.filename,
                        content_disposition_type="inline", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/{project_id}/files/{file_id}/locator/{number}")
def read_source_locator(project_id: str, file_id: str, number: int, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]) -> dict[str, object]:
    project = get_owned_project(project_id, current_user.id, db)
    source = db.scalar(select(SourceFile).where(SourceFile.id == file_id, SourceFile.project_id == project.id))
    if source is None or source.status != "ready" or not Path(source.storage_path).is_file():
        raise HTTPException(404, "Source file is unavailable")
    pages, _ = extract_pages(source.filename, Path(source.storage_path).read_bytes())
    page = next((page for page in pages if page.page_number == number), None)
    if page is None:
        raise HTTPException(404, "Source location not found")
    return {"filename": source.filename, "number": number, "locator_type": page.locator_type, "text": page.text}
