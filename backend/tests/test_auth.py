"""Tests-first coverage of stage-one auth security and ownership helpers."""

from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import get_owned_project
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.db.session import Base
from app.models.models import Project, User


def test_password_hash_verifies_only_correct_password() -> None:
    hashed = hash_password("a-strong-example-password")
    assert hashed != "a-strong-example-password"
    assert verify_password("a-strong-example-password", hashed)
    assert not verify_password("incorrect-password", hashed)


def test_access_token_encodes_and_decodes_subject() -> None:
    subject = str(uuid4())
    assert decode_access_token(create_access_token(subject))["sub"] == subject


def test_password_hash_uses_argon2id() -> None:
    assert hash_password("a-strong-example-password").startswith("$argon2id$")


def test_project_schema_has_user_ownership_and_dependent_entities() -> None:
    assert Project.__table__.c.owner_id.foreign_keys
    assert "source_files" in Base.metadata.tables
    assert "conversations" in Base.metadata.tables
    assert "chat_messages" in Base.metadata.tables
    assert "notes" in Base.metadata.tables


def test_owner_guard_rejects_other_users_project() -> None:
    project = Project(id=str(uuid4()), owner_id=str(uuid4()), name="private research")
    db = _LookupSession(project)

    with pytest.raises(HTTPException) as exc:
        get_owned_project(project.id, owner_id=str(uuid4()), db=db)

    assert exc.value.status_code == 404


class _LookupSession:
    def __init__(self, project: Project) -> None:
        self.project = project

    def get(self, model, item_id):
        assert model is Project
        assert item_id == self.project.id
        return self.project
