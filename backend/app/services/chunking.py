"""Token-bounded page-preserving document chunking."""

from uuid import uuid4

import tiktoken

from app.core.config import settings
from app.services.parsing import ExtractedPage

_encoder = tiktoken.get_encoding("cl100k_base")


def chunk_pages(
    pages: list[ExtractedPage],
    filename: str,
    *,
    chunk_size_tokens: int | None = None,
    overlap_tokens: int | None = None,
) -> list[dict[str, str | int]]:
    """Split each source page into overlapping token chunks without losing locators."""
    chunk_size = settings.chunk_size_tokens if chunk_size_tokens is None else chunk_size_tokens
    overlap = settings.chunk_overlap_tokens if overlap_tokens is None else overlap_tokens
    if chunk_size < 1 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("Require chunk_size >= 1 and 0 <= overlap < chunk_size")

    step = chunk_size - overlap
    chunks: list[dict[str, str | int]] = []
    for page in pages:
        encoded = _encoder.encode(page.text, disallowed_special=())
        for start in range(0, len(encoded), step):
            text = _encoder.decode(encoded[start : start + chunk_size]).strip()
            if text:
                chunks.append(
                    {
                        "id": str(uuid4()),
                        "text": text,
                        "filename": filename,
                        "page": page.page_number,
                        "locator_type": page.locator_type,
                    }
                )
            if len(chunks) > settings.max_chunks:
                from fastapi import HTTPException
                raise HTTPException(413, "The document exceeds the chunk limit")
    return chunks
