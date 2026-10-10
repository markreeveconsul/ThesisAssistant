"""Pytest fixtures for isolated SQL databases and authenticated API tests."""

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password
from app.db.session import Base, get_db
from app.main import app
from app.models.models import User


@pytest.fixture()
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture()
def test_session_factory(test_engine):
    return sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def client(test_session_factory, monkeypatch, tmp_path) -> Iterator[TestClient]:
    def override_db():
        session = test_session_factory()
        try:
            yield session
        finally:
            session.close()

    monkeypatch.setattr("app.main.init_db", lambda: None)
    monkeypatch.setattr("app.main.settings.upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr("app.main.settings.chroma_dir", str(tmp_path / "chroma"))
    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def make_user(test_session_factory):
    def factory(email: str | None = None, password: str = "correct-horse-battery-20") -> tuple[User, str]:
        session: Session = test_session_factory()
        try:
            normalized = email or f"{uuid4().hex}@example.org"
            user = User(email=normalized, hashed_password=hash_password(password))
            session.add(user)
            session.commit()
            session.refresh(user)
            token = create_access_token(user.id)
            session.expunge(user)
            return user, token
        finally:
            session.close()

    return factory


@pytest.fixture()
def auth_headers():
    return lambda token: {"Authorization": f"Bearer {token}"}
