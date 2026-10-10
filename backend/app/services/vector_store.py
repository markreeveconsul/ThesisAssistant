"""Chroma persistence and explicit deletion of project-scoped embeddings."""

from functools import lru_cache

import chromadb
from ollama import Client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_collection():
    """Return the persistent Chroma collection using local Ollama embeddings."""
    client = chromadb.PersistentClient(path=str(settings.resolved_chroma_dir))

    @lru_cache(maxsize=1)
    def _embedder():
        from chromadb.utils.embedding_functions import EmbeddingFunction

        class OllamaEmbeddingFunction(EmbeddingFunction):
            def __init__(self) -> None:
                pass

            def __call__(self, input: list[str]):
                ollama = Client(host=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds)
                return ollama.embed(model=settings.ollama_embed_model, input=input).embeddings

            @staticmethod
            def name() -> str:
                return "thesis_assistant_ollama_embeddings"

            def get_config(self) -> dict[str, str]:
                return {
                    "url": settings.ollama_base_url,
                    "model": settings.ollama_embed_model,
                }

            @staticmethod
            def build_from_config(config: dict[str, str]):
                return OllamaEmbeddingFunction()

        return OllamaEmbeddingFunction()

    collection = client.get_or_create_collection(
        name="thesis_chunks",
        embedding_function=_embedder(),
        metadata={"hnsw:space": "cosine", "embedding_model": settings.ollama_embed_model},
    )
    return collection


def check_embedding_model(collection) -> None:
    model = (collection.metadata or {}).get("embedding_model")
    if model != settings.ollama_embed_model:
        if collection.count():
            raise RuntimeError("Embedding model changed or legacy index found; run python -m app.reindex")
        collection.modify(metadata={"hnsw:space": "cosine", "embedding_model": settings.ollama_embed_model})


def upsert_chunks(chunks: list[dict[str, str | int]], project_id: str, file_id: str) -> None:
    """Embed and persist document chunks with ownership and locator metadata."""
    if not chunks:
        return
    collection = get_collection()
    check_embedding_model(collection)
    for start in range(0, len(chunks), 32):
        batch = chunks[start:start + 32]
        collection.upsert(
            ids=[str(chunk["id"]) for chunk in batch],
            documents=[str(chunk["text"]) for chunk in batch],
            metadatas=[{
                "project_id": project_id, "file_id": file_id,
                "filename": str(chunk["filename"]), "page": int(chunk["page"]),
                "locator_type": str(chunk.get("locator_type", "page")),
            } for chunk in batch],
        )


def query_project_chunks(project_id: str, query: str, file_id: str | None = None) -> list[dict[str, object]]:
    """Retrieve only this project's nearest chunks and preserve source locators."""
    if not query.strip():
        return []
    collection = get_collection()
    check_embedding_model(collection)
    result = collection.query(
        query_texts=[query],
        n_results=settings.retrieval_top_k,
        where={"$and": [{"project_id": project_id}, {"file_id": file_id}]} if file_id else {"project_id": project_id},
        include=["documents", "metadatas", "distances"],
    )
    docs = result.get("documents", [[]])[0]
    metadata = result.get("metadatas", [[]])[0]
    distances = result.get("distances", [[]])[0]
    return [
        {"text": text, **meta, "distance": distance}
        for text, meta, distance in zip(docs, metadata, distances, strict=False)
        if distance <= settings.min_relevance_distance
    ]


def delete_file_chunks(file_id: str) -> None:
    """Delete every indexed chunk belonging to one source file."""
    collection = get_collection()
    collection.delete(where={"file_id": file_id})


def delete_project_chunks(project_id: str) -> None:
    """Delete every indexed chunk belonging to one project."""
    collection = get_collection()
    collection.delete(where={"project_id": project_id})
