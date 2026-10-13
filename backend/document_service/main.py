"""Loopback-only parsing API. Files are temporary; the browser owns source persistence."""

import asyncio
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import JSONResponse

BACKEND = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND / ".env")
MAX_BYTES = int(os.getenv("DOCUMENT_MAX_UPLOAD_MB", "25")) * 1024 * 1024
MAX_PAGES = int(os.getenv("DOCUMENT_MAX_PAGES", "300"))
MAX_CHARS = 2_000_000
PARSE_TIMEOUT = int(os.getenv("DOCUMENT_PARSE_TIMEOUT", "45"))
DEFAULT_ORIGINS = ",".join(
    f"http://{host}:{port}"
    for host in ("127.0.0.1", "localhost")
    for port in (3000, 3001, 3002, 3012)
)
ORIGINS = [origin.strip() for origin in os.getenv("DOCUMENT_ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if origin.strip()]
if not (1 <= MAX_BYTES <= 100 * 1024 * 1024 and 1 <= MAX_PAGES <= 1000 and 1 <= PARSE_TIMEOUT <= 120):
    raise ValueError("Document limits must be 1-100 MB, 1-1000 pages and 1-120 seconds.")
slots = asyncio.Semaphore(2)
app = FastAPI(title="Thesa document service", docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver"])
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Filename"])


@app.middleware("http")
async def local_boundary(request: Request, call_next):
    if request.client and request.client.host not in {"127.0.0.1", "::1", "testclient"}:
        return JSONResponse({"detail": "This document service only accepts local connections."}, status_code=403)
    if request.method == "POST" and request.headers.get("origin") not in ORIGINS:
        return JSONResponse({"detail": "Source upload requires an allowed local Thesa origin."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def safe_filename(value: str) -> str:
    name = unquote(value).replace("\\", "/").split("/")[-1]
    name = re.sub(r'[\x00-\x1f\x7f<>:"|?*]', "_", name).strip(" .")
    if len(name) > 180:
        name = name[:160] + Path(name).suffix
    return name or "source"


def parse_in_worker(content: bytes, filename: str) -> dict[str, object]:
    # TemporaryDirectory cleans both the original and extracted text on success or failure.
    with TemporaryDirectory(prefix="thesa-document-") as directory:
        source = Path(directory) / "upload"
        result = Path(directory) / "result.json"
        source.write_bytes(content)
        env = {**os.environ, "MAX_PDF_PAGES": str(MAX_PAGES), "MAX_EXTRACTED_CHARS": str(MAX_CHARS), "MAX_DOCX_EXPANDED_MB": "50"}
        try:
            subprocess.run([sys.executable, "-m", "document_service.worker", str(source), filename, str(result)],
                           cwd=BACKEND, env=env, timeout=PARSE_TIMEOUT, check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(408, "Parsing took too long. Try a smaller document.") from exc
        except subprocess.CalledProcessError as exc:
            raise HTTPException(422, "The document parser could not read this file.") from exc
        if not result.is_file() or result.stat().st_size > 16_000_000:
            raise HTTPException(413, "The extracted document is too large.")
        parsed = json.loads(result.read_text(encoding="utf-8"))
        if "error" in parsed:
            raise HTTPException(parsed["status"], parsed["error"])
        return parsed


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "thesa-documents", "max_upload_bytes": MAX_BYTES, "max_pdf_pages": MAX_PAGES}


@app.post("/parse")
async def parse_document(request: Request) -> dict[str, object]:
    filename = safe_filename(request.headers.get("x-filename", ""))
    extension = Path(filename).suffix.lower()
    if extension not in {".pdf", ".docx", ".txt"}:
        raise HTTPException(415, "Choose a PDF, DOCX or UTF-8 TXT file.")
    if slots.locked():
        raise HTTPException(429, "The parser is busy. Please retry shortly.")
    async with slots:
        content = bytearray()
        try:
            async with asyncio.timeout(40):
                async for chunk in request.stream():
                    if len(content) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413, f"Maximum file size is {MAX_BYTES // (1024 * 1024)} MB.")
                    content.extend(chunk)
        except TimeoutError as exc:
            raise HTTPException(408, "The upload took too long. Please retry.") from exc
        if not content:
            raise HTTPException(422, "The file is empty.")
        if (extension == ".pdf" and not content.startswith(b"%PDF-")) or (extension == ".docx" and not content.startswith(b"PK")):
            raise HTTPException(415, "The file contents do not match its extension.")
        parsed = await run_in_threadpool(parse_in_worker, bytes(content), filename)
    return {"filename": filename, "sha256": hashlib.sha256(content).hexdigest(), "format": extension[1:], **parsed}
