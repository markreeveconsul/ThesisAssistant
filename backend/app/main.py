"""ThesisAssistant HTTP API entry point."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, chat, files, notes, projects, summaries
from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Initialize the MVP database and local storage when the server starts."""
    Path(settings.resolved_upload_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.resolved_chroma_dir).mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=f"{settings.api_v1_prefix}/auth", tags=["auth"])
app.include_router(projects.router, prefix=f"{settings.api_v1_prefix}/projects", tags=["projects"])
app.include_router(files.router, prefix=f"{settings.api_v1_prefix}/projects", tags=["files"])
app.include_router(chat.router, prefix=f"{settings.api_v1_prefix}/projects", tags=["chat"])
app.include_router(summaries.router, prefix=f"{settings.api_v1_prefix}/projects", tags=["summaries"])
app.include_router(notes.router, prefix=f"{settings.api_v1_prefix}/projects", tags=["notes"])


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
