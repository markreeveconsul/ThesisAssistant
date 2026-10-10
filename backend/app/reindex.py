"""Rebuild the local index after changing embedding models. Stop the API first."""

from pathlib import Path

import chromadb
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal, init_db
from app.models.models import SourceFile
from app.services.chunking import chunk_pages
from app.services.parsing import extract_pages
from app.services.vector_store import get_collection, upsert_chunks


def main() -> None:
    init_db()
    with SessionLocal() as db:
        sources = list(db.scalars(select(SourceFile)))
        for source in sources:
            source.status = "failed"
        db.commit()
        client = chromadb.PersistentClient(path=str(settings.resolved_chroma_dir))
        if "thesis_chunks" in [collection.name for collection in client.list_collections()]:
            client.delete_collection("thesis_chunks")
        get_collection.cache_clear()
        for source in sources:
            pages, warning = extract_pages(source.filename, Path(source.storage_path).read_bytes())
            upsert_chunks(chunk_pages(pages, source.filename), source.project_id, source.id)
            source.status = "ready"
            source.warning = warning
            db.commit()
        print(f"Reindexed {len(sources)} documents with {settings.ollama_embed_model}.")


if __name__ == "__main__":
    main()
