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
            def __call__(self, input: list[str]) -> list[list[float]]:
                ollama = Client(host=settings.ollama_base_url, timeout=settings.ollama_timeout_seconds)
                return ollama.embed(model=settings.ollama_embed_model, input=input).embeddings

        return OllamaEmbeddingFunction()

    return client.get_or_create_collection(
        name="thesis_chunks",
        embedding_function=_embedder(),
        metadata={"hnsw:space": "cosine"},
    )


def upsert_chunks(chunks: list[dict[str, str | int]], project_id: str, file_id: str) -> None:
    """Embed and persist document chunks with ownership and locator metadata."""
    if not chunks:
        return
    collection = get_collection()
    collection.upsert(
        ids=[str(chunk["id"]) for chunk in chunks],
        documents=[str(chunk["text"]) for chunk in chunks],
        metadatas=[
            {
                "project_id": project_id,
                "file_id": file_id,
                "filename": str(chunk["filename"]),
                "page": int(chunk["page"]),
            }
            for chunk in chunks
        ],
    )


def query_project_chunks(project_id: str, query: str) -> list[dict[str, object]]:
    """Retrieve only this project's nearest chunks and preserve source locators."""
    if not query.strip():
        return []
    result = get_collection().query(
        query_texts=[query],
        n_results=settings.retrieval_top_k,
        where={"project_id": project_id},
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
