"""Project CRUD with ownership enforced on all access paths."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_owned_project
from app.db.session import get_db
from app.models.models import Project, User
from app.schemas import ProjectCreate, ProjectRead
from app.services.vector_store import delete_project_chunks

router = APIRouter()


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Project:
    project = Project(name=payload.name.strip(), owner_id=current_user.id)
    if not project.name:
        raise HTTPException(status_code=422, detail="Project name must not be blank")
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/", response_model=list[ProjectRead])
def list_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[Project]:
    return list(
        db.scalars(select(Project).where(Project.owner_id == current_user.id).order_by(Project.created_at.desc()))
    )


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(project: Annotated[Project, Depends(require_owned_project)]) -> Project:
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project: Annotated[Project, Depends(require_owned_project)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    delete_project_chunks(project.id)
    for source in project.files:
        Path(source.storage_path).unlink(missing_ok=True)
    db.delete(project)
    db.commit()
