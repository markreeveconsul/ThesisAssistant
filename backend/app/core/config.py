"""Environment-backed application settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Validated settings loaded from the project .env and process environment."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ThesisAssistant"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    secret_key: str = "insecure-development-key-change-before-deployment"
    access_token_expire_minutes: int = 60
    database_url: str = "sqlite:///./data/thesis_assistant.db"
    upload_dir: str = "./uploads"
    chroma_dir: str = "./chroma"
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "qwen2.5:3b"
    ollama_embed_model: str = "nomic-embed-text"
    max_upload_mb: int = Field(default=25, ge=1, le=100)
    max_pdf_pages: int = Field(default=1000, ge=1)
    max_extracted_chars: int = Field(default=2_000_000, ge=1)
    max_docx_expanded_mb: int = Field(default=100, ge=1)
    max_chunks: int = Field(default=10000, ge=1)
    chunk_size_tokens: int = 700
    chunk_overlap_tokens: int = 100
    retrieval_top_k: int = 5
    min_relevance_distance: float = 0.75
    ollama_timeout_seconds: int = 120
    cors_origins: str = "http://localhost:3000"

    @field_validator("secret_key")
    @classmethod
    def require_secret_in_production(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("SECRET_KEY must not be empty")
        return value

    @model_validator(mode="after")
    def validate_limits(self):
        if self.app_env != "development" and (len(self.secret_key) < 32 or self.secret_key.startswith("insecure-")):
            raise ValueError("Set a random SECRET_KEY of at least 32 characters outside development")
        if not 0 <= self.chunk_overlap_tokens < self.chunk_size_tokens:
            raise ValueError("Require 0 <= CHUNK_OVERLAP_TOKENS < CHUNK_SIZE_TOKENS")
        if min(self.retrieval_top_k, self.ollama_timeout_seconds, self.access_token_expire_minutes) <= 0:
            raise ValueError("Retrieval, timeout and expiration limits must be positive")
        return self

    @property
    def sqlite_path(self) -> Path | None:
        if not self.database_url.startswith("sqlite:///"):
            return None
        raw_path = self.database_url.removeprefix("sqlite:///")
        path = Path(raw_path)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def resolved_upload_dir(self) -> Path:
        path = Path(self.upload_dir)
        return path if path.is_absolute() else BACKEND_DIR / path

    @property
    def resolved_chroma_dir(self) -> Path:
        path = Path(self.chroma_dir)
        return path if path.is_absolute() else BACKEND_DIR / path


@lru_cache

def get_settings() -> Settings:
    return Settings()


settings = get_settings()
