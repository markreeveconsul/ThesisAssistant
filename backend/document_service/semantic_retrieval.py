"""Project-scoped semantic retrieval with an ephemeral, bounded embedding cache."""

import asyncio
import hashlib
import math
from collections import OrderedDict

import httpx

from .ai_provider import ChatConfig, ProviderError, embed_texts
from .retrieval import Question, candidate_chunks, retrieve as lexical_retrieve

CACHE_LIMIT = 5000
BATCH_SIZE = 12
_embedding_cache: OrderedDict[str, list[float]] = OrderedDict()
_cache_lock = asyncio.Lock()


def clear_embedding_cache() -> None:
    """Clear cached vectors; useful for tests and local troubleshooting."""
    _embedding_cache.clear()


def _cache_key(config: ChatConfig, project_id: str, item: dict) -> str:
    identity = "\0".join((
        config.embedding_model,
        str(config.embedding_dimensions),
        project_id,
        item["source_id"],
        item["filename"],
        str(item["location"]),
        item["text"],
    ))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


async def _cached_document_vectors(
    question: Question,
    config: ChatConfig,
    client: httpx.AsyncClient,
    candidates: list[dict],
) -> list[list[float]]:
    keys = [_cache_key(config, question.project_id, item) for item in candidates]
    async with _cache_lock:
        missing_indexes = [index for index, key in enumerate(keys) if key not in _embedding_cache]
        for start in range(0, len(missing_indexes), BATCH_SIZE):
            batch_indexes = missing_indexes[start:start + BATCH_SIZE]
            vectors = await embed_texts(
                config,
                client,
                [candidates[index]["text"] for index in batch_indexes],
                "RETRIEVAL_DOCUMENT",
                [candidates[index]["filename"] for index in batch_indexes],
            )
            for index, vector in zip(batch_indexes, vectors, strict=True):
                key = keys[index]
                _embedding_cache[key] = vector
                _embedding_cache.move_to_end(key)
                while len(_embedding_cache) > CACHE_LIMIT:
                    _embedding_cache.popitem(last=False)
        return [_embedding_cache[key] for key in keys]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or len(left) != len(right):
        raise ValueError("Embedding vectors must be non-empty and have matching dimensions.")
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def _combine_matches(
    semantic_matches: list[tuple[float, dict]],
    keyword_matches: list[dict],
    top_k: int,
) -> list[dict]:
    combined = [
        dict(candidate, similarity=score)
        for score, candidate in semantic_matches[: min(3, top_k)]
    ]
    seen = {
        (item["source_id"], item["location"], item["text"])
        for item in combined
    }
    for candidate in keyword_matches:
        key = (candidate["source_id"], candidate["location"], candidate["text"])
        if key not in seen:
            combined.append(candidate)
            seen.add(key)
        if len(combined) >= top_k:
            break
    return [
        dict(candidate, id=f"E{index + 1}")
        for index, candidate in enumerate(combined)
    ]


async def retrieve_semantic(
    question: Question,
    config: ChatConfig,
    client: httpx.AsyncClient,
    top_k: int = 5,
) -> list[dict]:
    """Combine paraphrase-friendly semantic hits with precise lexical matches."""
    candidates = candidate_chunks(question)
    if not candidates:
        return []

    document_vectors = await _cached_document_vectors(question, config, client, candidates)
    query_vectors = await embed_texts(
        config, client, [question.retrieval_query], "QUESTION_ANSWERING"
    )
    query_vector = query_vectors[0]

    ranked = sorted(
        (
            (cosine_similarity(query_vector, vector), index, candidate)
            for index, (candidate, vector) in enumerate(zip(candidates, document_vectors, strict=True))
        ),
        key=lambda item: (-item[0], item[1]),
    )
    selected = [
        (score, candidate)
        for score, _, candidate in ranked
        if score >= config.minimum_similarity
    ]
    keywords = lexical_retrieve(question, top_k=top_k)
    return _combine_matches(selected, keywords, top_k)
