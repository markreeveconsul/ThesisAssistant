"""Server-side Gemini API adapter for chat and text embeddings."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

import httpx
from dotenv import load_dotenv


class ProviderError(Exception):
    """An actionable provider error safe to show without leaking prompts or credentials."""


@dataclass(frozen=True)
class ChatConfig:
    key: str = field(repr=False)
    model: str = "gemini-3.6-flash"
    embedding_model: str = "gemini-embedding-2"
    base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    embedding_dimensions: int = 768
    minimum_similarity: float = 0.3

    @classmethod
    def from_env(cls) -> "ChatConfig":
        load_dotenv(Path(__file__).resolve().parents[1] / ".env")
        key = os.getenv("GEMINI_API_KEY", "").strip()
        if not key or key == "YOUR_GEMINI_API_KEY":
            raise ProviderError("Add your Google AI Studio key to GEMINI_API_KEY in backend/.env.")
        try:
            config = cls(
                key=key,
                model=os.getenv("AI_CHAT_MODEL", "gemini-3.6-flash").strip() or "gemini-3.6-flash",
                embedding_model=os.getenv("AI_EMBED_MODEL", "gemini-embedding-2").strip()
                or "gemini-embedding-2",
                base_url=os.getenv(
                    "GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
                ).strip().rstrip("/"),
                embedding_dimensions=int(os.getenv("AI_EMBED_DIMENSIONS", "768")),
                minimum_similarity=float(os.getenv("AI_RETRIEVAL_MIN_SCORE", "0.3")),
            )
        except ValueError as exc:
            raise ProviderError("AI_EMBED_DIMENSIONS and AI_RETRIEVAL_MIN_SCORE must be valid numbers.") from exc
        if config.embedding_dimensions not in {768, 1536, 3072}:
            raise ProviderError("AI_EMBED_DIMENSIONS must be 768, 1536, or 3072.")
        if not -1 <= config.minimum_similarity <= 1:
            raise ProviderError("AI_RETRIEVAL_MIN_SCORE must be between -1 and 1.")
        if not config.base_url:
            raise ProviderError("GEMINI_API_BASE_URL cannot be empty.")
        return config

    def model_url(self, model: str, method: str) -> str:
        resource = model if model.startswith("models/") else f"models/{model}"
        return f"{self.base_url}/{quote(resource, safe='/')}:{method}"


def _error_message(status: int, stage: str) -> str:
    if status in (401, 403):
        return "Gemini rejected the API key or project access. Check GEMINI_API_KEY and AI Studio."
    if status == 429:
        return (
            f"Gemini API rate limit reached during {stage}. Check this project's RPM, TPM, and "
            "daily limits in Google AI Studio, or wait before retrying."
        )
    if status == 400:
        return f"Gemini rejected the {stage} request. Check the configured model ID and request limits."
    if status == 404:
        return f"The configured Gemini model is unavailable for {stage}. Check its exact model ID."
    if status in (413, 422):
        return f"The Gemini {stage} request is too large. Reduce the source library and retry."
    return f"Gemini is unavailable during {stage} (HTTP {status}). Retry later."


def checked_json(response: httpx.Response, stage: str) -> dict:
    if response.status_code >= 400:
        raise ProviderError(_error_message(response.status_code, stage))
    try:
        payload = response.json()
    except ValueError as exc:
        raise ProviderError(f"Gemini returned invalid JSON during {stage}.") from exc
    if not isinstance(payload, dict):
        raise ProviderError(f"Gemini returned an invalid response during {stage}.")
    return payload


def _gemini_contents(messages: list[dict[str, str]]) -> tuple[str | None, list[dict]]:
    system_parts = [message["content"] for message in messages if message.get("role") == "system"]
    contents = []
    for message in messages:
        role = message.get("role")
        if role == "system":
            continue
        if role not in {"user", "assistant", "model"}:
            raise ProviderError("The chat request contains an unsupported message role.")
        contents.append({
            "role": "model" if role in {"assistant", "model"} else "user",
            "parts": [{"text": message.get("content", "")}],
        })
    return "\n\n".join(system_parts) or None, contents


async def complete(
    config: ChatConfig,
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
    max_tokens: int = 512,
) -> str:
    """Run one bounded Gemini completion without retries or model fallbacks."""
    system, contents = _gemini_contents(messages)
    if not contents:
        raise ProviderError("The chat request has no user message.")
    payload = {
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "thinkingConfig": {"thinkingLevel": "low"},
        },
    }
    if system:
        payload["systemInstruction"] = {"parts": [{"text": system}]}
    try:
        response = await client.post(
            config.model_url(config.model, "generateContent"),
            headers={"x-goog-api-key": config.key},
            json=payload,
        )
    except httpx.TimeoutException as exc:
        raise ProviderError("Gemini timed out after 30 seconds. Retry later.") from exc
    except httpx.RequestError as exc:
        raise ProviderError("Cannot reach Gemini. Check your internet connection.") from exc

    result = checked_json(response, "chat")
    try:
        content = result["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("Gemini returned no usable text. Retry with a shorter question.") from exc
    if not isinstance(text, str) or not text.strip():
        raise ProviderError("Gemini returned no usable text. Retry with a shorter question.")
    return text.strip()


def _embedding_request(config: ChatConfig, text: str, task: str, title: str | None) -> dict:
    is_embedding_two = config.embedding_model.startswith("gemini-embedding-2")
    if is_embedding_two:
        if task == "RETRIEVAL_DOCUMENT":
            content_text = f"title: {title or 'none'} | text: {text}"
        else:
            content_text = f"task: question answering | query: {text}"
        embed_config = {"outputDimensionality": config.embedding_dimensions}
    else:
        content_text = text
        embed_config = {
            "taskType": task,
            "outputDimensionality": config.embedding_dimensions,
        }
        if title and task == "RETRIEVAL_DOCUMENT":
            embed_config["title"] = title
    request = {"model": f"models/{config.embedding_model.removeprefix('models/')}"}
    request["content"] = {"parts": [{"text": content_text}]}
    request["embedContentConfig"] = embed_config
    return request


async def embed_texts(
    config: ChatConfig,
    client: httpx.AsyncClient,
    texts: list[str],
    task: str,
    titles: list[str | None] | None = None,
) -> list[list[float]]:
    """Generate independently ordered vectors using Gemini's synchronous batch endpoint."""
    if not texts:
        return []
    if titles is None:
        titles = [None] * len(texts)
    if len(titles) != len(texts):
        raise ValueError("Embedding titles must match the number of texts.")
    requests = [
        _embedding_request(config, text, task, title)
        for text, title in zip(texts, titles, strict=True)
    ]
    url = config.model_url(config.embedding_model, "batchEmbedContents")
    try:
        response = await client.post(
            url,
            headers={"x-goog-api-key": config.key},
            json={"requests": requests},
        )
    except httpx.TimeoutException as exc:
        raise ProviderError("Gemini embeddings timed out after 30 seconds. Retry later.") from exc
    except httpx.RequestError as exc:
        raise ProviderError("Cannot reach Gemini embeddings. Check your internet connection.") from exc

    result = checked_json(response, "source indexing")
    raw_vectors = result.get("embeddings")
    if not isinstance(raw_vectors, list) or len(raw_vectors) != len(texts):
        raise ProviderError("Gemini returned an incomplete embedding batch. Retry the question.")
    vectors = []
    for item in raw_vectors:
        values = item.get("values") if isinstance(item, dict) else None
        if not isinstance(values, list) or not values or not all(
            isinstance(value, (int, float)) for value in values
        ):
            raise ProviderError("Gemini returned an invalid source embedding. Retry the question.")
        vectors.append([float(value) for value in values])
    if any(len(vector) != len(vectors[0]) for vector in vectors):
        raise ProviderError("Gemini returned embeddings with inconsistent dimensions.")
    return vectors


async def check_connection(config: ChatConfig, client: httpx.AsyncClient) -> str:
    return await complete(
        config,
        client,
        [{"role": "user", "content": "Connection test only. Reply with OK."}],
        256,
    )
