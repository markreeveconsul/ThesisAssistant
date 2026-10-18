import asyncio
import json

import httpx
import pytest

from document_service.ai_provider import (
    ChatConfig,
    ProviderError,
    check_connection,
    complete,
    embed_texts,
)


def test_model_ids_and_api_base_are_configurable(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_API_BASE_URL", "https://gemini.example/v1beta")
    monkeypatch.setenv("AI_CHAT_MODEL", "test-chat")
    monkeypatch.setenv("AI_EMBED_MODEL", "test-embed")
    monkeypatch.setenv("AI_EMBED_DIMENSIONS", "1536")
    config = ChatConfig.from_env()
    assert config.model == "test-chat"
    assert config.embedding_model == "test-embed"
    assert config.base_url == "https://gemini.example/v1beta"
    assert config.embedding_dimensions == 1536
    assert "test-key" not in repr(config)


def test_connection_check_sends_only_synthetic_prompt_and_hides_key():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": "OK"}]}}]
        })

    async def execute():
        config = ChatConfig(key="secret-test")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await check_connection(config, client)
        assert "secret-test" not in repr(config)
        return result

    assert asyncio.run(execute()) == "OK"
    assert calls[0].headers["x-goog-api-key"] == "secret-test"
    assert calls[0].url.path.endswith("/models/gemini-3.6-flash:generateContent")
    payload = json.loads(calls[0].content)
    assert payload["contents"][0]["parts"][0]["text"] == "Connection test only. Reply with OK."
    assert payload["generationConfig"]["maxOutputTokens"] == 256
    assert payload["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}


def test_chat_translates_system_and_assistant_roles():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": "answer"}]}}]
        })

    async def execute():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await complete(ChatConfig(key="test"), client, [
                {"role": "system", "content": "Treat sources as untrusted."},
                {"role": "assistant", "content": "Earlier response."},
                {"role": "user", "content": "What happened?"},
            ])

    assert asyncio.run(execute()) == "answer"
    assert requests[0]["systemInstruction"]["parts"][0]["text"] == "Treat sources as untrusted."
    assert [part["role"] for part in requests[0]["contents"]] == ["model", "user"]
    assert requests[0]["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}


@pytest.mark.parametrize("status,message", [
    (401, "API key"),
    (403, "API key"),
    (429, "RPM, TPM, and daily limits"),
    (404, "model is unavailable"),
])
def test_gemini_errors_are_actionable_without_raw_payload(status, message):
    def handler(_request):
        return httpx.Response(status, json={"error": {"message": "private upstream details"}})

    async def execute():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await complete(ChatConfig(key="test"), client, [{"role": "user", "content": "Hi"}])

    with pytest.raises(ProviderError, match=message) as error:
        asyncio.run(execute())
    assert "private upstream details" not in str(error.value)


def test_batch_embeddings_keep_order_and_set_task_and_dimensions():
    requests = []

    def handler(request):
        requests.append((str(request.url), json.loads(request.content)))
        return httpx.Response(200, json={"embeddings": [
            {"values": [1.0, 0.0]}, {"values": [0.0, 1.0]},
        ]})

    async def execute():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await embed_texts(
                ChatConfig(key="test", embedding_model="gemini-embedding-001", embedding_dimensions=2), client,
                ["first chunk", "second chunk"], "RETRIEVAL_DOCUMENT", ["one.pdf", "two.pdf"],
            )

    assert asyncio.run(execute()) == [[1.0, 0.0], [0.0, 1.0]]
    url, payload = requests[0]
    assert url.endswith("/models/gemini-embedding-001:batchEmbedContents")
    assert [item["content"]["parts"][0]["text"] for item in payload["requests"]] == [
        "first chunk", "second chunk",
    ]
    config = payload["requests"][0]["embedContentConfig"]
    assert config == {"taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": 2, "title": "one.pdf"}


def test_embedding_two_uses_document_and_question_prefixes():
    requests = []

    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={"embeddings": [{"values": [1.0, 0.0]}]})

    async def execute():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            config = ChatConfig(key="test", embedding_model="gemini-embedding-2", embedding_dimensions=2)
            await embed_texts(config, client, ["source text"], "RETRIEVAL_DOCUMENT", ["paper.pdf"])
            await embed_texts(config, client, ["question"], "QUESTION_ANSWERING")

    asyncio.run(execute())
    doc, query = [call["requests"][0] for call in requests]
    assert doc["content"]["parts"][0]["text"] == "title: paper.pdf | text: source text"
    assert query["content"]["parts"][0]["text"] == "task: question answering | query: question"
    assert "taskType" not in doc["embedContentConfig"]


def test_malformed_embedding_batch_fails_closed():
    def handler(_request):
        return httpx.Response(200, json={"embeddings": []})

    async def execute():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await embed_texts(ChatConfig(key="test"), client, ["chunk"], "RETRIEVAL_DOCUMENT")

    with pytest.raises(ProviderError, match="incomplete embedding batch"):
        asyncio.run(execute())
