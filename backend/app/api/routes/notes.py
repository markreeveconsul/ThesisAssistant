"""Project-scoped note creation and listing."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_owned_project
from app.db.session import get_db
from app.models.models import Note, User
from app.schemas import NoteCreate, NoteRead

router = APIRouter()


@router.get("/{project_id}/notes", response_model=list[NoteRead])
def list_notes(
    project_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[Note]:
    project = get_owned_project(project_id, current_user.id, db)
    return project.notes


@router.post("/{project_id}/notes", response_model=NoteRead, status_code=201)
def create_note(
    project_id: str,
    payload: NoteCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Note:
    project = get_owned_project(project_id, current_user.id, db)
    note = Note(
        project_id=project.id,
        title=payload.title.strip(),
        content=payload.content.strip(),
        citations_json=payload.citations_json,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
