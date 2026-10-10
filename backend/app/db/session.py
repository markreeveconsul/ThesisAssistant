"""Database engines, sessions, and declarative base."""

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


def _create_engine():
    if settings.database_url.startswith("sqlite"):
        if settings.sqlite_path is not None:
            Path(settings.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(
            settings.database_url,
            connect_args={"check_same_thread": False},
        )

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_engine(settings.database_url, pool_pre_ping=True)


engine = _create_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Shared declarative base for persisted models."""


def get_db() -> Generator[Session, None, None]:
    """Yield a request-scoped database session and always close it."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db() -> None:
    """Create local SQLite tables for the MVP."""
    from app.models import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
