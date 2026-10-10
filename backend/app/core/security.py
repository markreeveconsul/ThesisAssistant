"""Password hashing and signed access-token helpers."""

from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

_ALGORITHM = "HS256"
_password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    """Hash a raw password using the recommended Argon2id configuration."""
    return _password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Constant-time verify a raw password against an Argon2id hash."""
    return _password_hash.verify(password, hashed_password)


def create_access_token(subject: str) -> str:
    """Issue a signed bearer token with an explicit expiration."""
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expires_at},
        settings.secret_key,
        algorithm=_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, object]:
    """Decode and validate an access token, raising on expiry or tampering."""
    return jwt.decode(token, settings.secret_key, algorithms=[_ALGORITHM])
