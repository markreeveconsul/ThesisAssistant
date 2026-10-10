"""Project CRUD with ownership enforced on all access paths."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_owned_project
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Project, User
from app.schemas import ProjectCreate, ProjectRead
from app.services.vector_store import delete_project_chunks

from app.services.lifecycle import project_mutation

router = APIRouter()


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Project:
    """Create a project owned by the authenticated user."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Project name must not be blank")
    project = Project(name=name, owner_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/", response_model=list[ProjectRead])
def list_projects(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[Project]:
    """Return only projects owned by the authenticated user."""
    return list(
        db.scalars(
            select(Project)
            .where(Project.owner_id == current_user.id)
            .order_by(Project.created_at.desc())
        )
    )


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(
    project_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Project:
    """Return a project only to its owner."""
    return get_owned_project(project_id, current_user.id, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
@project_mutation
def delete_project(
    project_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    project = get_owned_project(project_id, current_user.id, db)
    if any(source.status == "processing" for source in project.files):
        raise HTTPException(409, "Wait for indexing to finish before deleting this project")
    for source in project.files:
        source.status = "deleting"
    db.commit()
    try:
        delete_project_chunks(project.id)
        for source in project.files:
            Path(source.storage_path).unlink(missing_ok=True)
    except Exception as exc:
        raise HTTPException(503, "Project cleanup failed; retry deletion") from exc
    db.delete(project)
    db.commit()
