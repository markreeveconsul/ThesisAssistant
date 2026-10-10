"""Dependencies for authenticated user and owner-scoped project access."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.models import Project, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")
DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    """Resolve a valid bearer token to its active database user."""
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if not isinstance(subject, str):
            raise ValueError("missing token subject")
        user = db.get(User, subject)
    except (InvalidTokenError, ValueError):
        user = None

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_owned_project(
    project_id: str,
    owner_id: str,
    db: Session,
) -> Project:
    """Return a project only if it exists and is owned by the current user."""
    project = db.get(Project, project_id)
    if project is None or project.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def require_owned_project(
    project_id: str,
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
) -> Project:
    """FastAPI dependency for enforcing ownership in nested project routes."""
    return get_owned_project(project_id, current_user.id, db)
