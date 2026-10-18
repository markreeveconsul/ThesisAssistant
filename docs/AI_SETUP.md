# Gemini source-assistant trial

Otto's source-question preview now calls Google's hosted Gemini API directly. It uses `gemini-embedding-2` for semantic retrieval and `gemini-3.6-flash` to choose exact quotations. The provider and models are configured in the backend, and no key is exposed to Next.js. Gemini is proprietary; this trial does not satisfy the project's original open-source-model requirement.

## Configure once

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey). Do not paste it into chat or frontend code.
2. Copy `backend/.env.example` to `backend/.env` if needed. Set `GEMINI_API_KEY` to the new Google key. Keep the existing base URL and model defaults for the first test.
3. Restart Thesa, then double-click **Check AI Connection.bat**. It sends only a synthetic connection prompt, not thesis sources.
4. Open a project with sources, agree to the Gemini disclosure in Otto, and ask a source question. The first question indexes all extracted chunks; later questions reuse those vectors while the backend remains running.

The available variables are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | Google AI Studio API key, backend-only |
| `GEMINI_API_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Gemini API endpoint |
| `AI_CHAT_MODEL` | `gemini-3.6-flash` | Chat model ID |
| `AI_EMBED_MODEL` | `gemini-embedding-2` | Embedding model ID |
| `AI_EMBED_DIMENSIONS` | `768` | Embedding vector size |
| `AI_RETRIEVAL_MIN_SCORE` | `0.3` | Minimum cosine similarity to consider as evidence |

The chat and embedding models can be swapped by changing their environment values. The adapter handles Gemini's distinct task formats for Embedding 2 and Embedding 001. Choose a model that is enabled for the API key and supported by the current Google API.

## What happens to documents

Files remain in the browser's IndexedDB. The browser sends the selected project's extracted text to local FastAPI. FastAPI splits each physical page into overlapping chunks, sends those chunks to Gemini for embeddings, and caches vectors in process memory (up to 5,000 vectors). It embeds the current question (adding the previous question only when the new message is an ambiguous follow-up), combines semantic matches with keyword matches, and sends up to five passages as sentence-level evidence choices to Gemini chat. Gemini writes a natural-language answer and returns IDs for up to three supporting passages. The backend validates those IDs and resolves them to original text, filename and page/paragraph/line location. The browser validates citations against its stored source. No vector database or persistent server-side source text is used by this preview.

Document vectors are created once per backend process and source content, then reused across questions. Restarting the backend clears this cache and causes the next question to re-index. A changed or deleted source is absent from the next request; cached vectors cannot independently produce a citation. This local cache is not durable storage or a multi-user database and the unauthenticated development API must not be exposed publicly.

## Quotas and privacy

Gemini avoids OpenRouter's free-model router, but does not provide unlimited calls. Every uncached chunk is embedded during initial indexing; each later question uses a query embedding and one chat completion. Gemini applies project/model-specific requests-per-minute, tokens-per-minute and requests-per-day limits. See active limits in AI Studio; they can vary, so this app does not promise a fixed number of questions. No automatic retries or paid-model fallback are made.

Google states that content sent through unpaid Gemini API services may be used to improve products, and human reviewers may process it. Do not use sensitive, confidential or personal thesis material with free-tier requests. Google's paid API terms state that prompts and responses are not used to improve products, but paid usage can incur cost. Check [current rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [pricing and data use](https://ai.google.dev/gemini-api/docs/pricing), and [API terms](https://ai.google.dev/gemini-api/terms) before use.

The checkbox in Otto discloses that extracted source chunks and the question go to Gemini for embeddings, and the question, recent chat context and retrieved passages go to Gemini chat. The original files and thesis draft are not sent. Users should test with synthetic or non-sensitive files first.

## Failure and quality limits

The UI reports missing configuration, invalid credentials, unavailable model IDs, quota errors, malformed provider output and timeouts. A provider failure is shown as an error, not as “I can't find this.” An empty semantic match or a model abstention produces “I can't find this in your documents.” Citations are exact extracted quotations and locations, not model-authored references. Relevance still needs human checking; embeddings and prompt instructions cannot guarantee that a quote proves a claim or defeat every prompt injection.

The HTTP response streams progress, the completed answer and validated citation events; the model's raw generated tokens are not streamed. Otto keeps the four latest messages (up to two exchanges) in browser memory so follow-up questions can refer to earlier turns. That context clears when sources or the project change, and it is not saved as chat history or notes. Text-only extraction cannot read scanned PDFs; OCR remains out of scope.

Backend unit tests mock Gemini and test request payloads, error handling, retrieval filtering, cache reuse and citations. The browser upload-to-citation test uses a test-only local retriever and model stub so it spends no API quota. These tests do not prove live Gemini availability or answer quality. Run **Check AI Connection.bat** for a synthetic live API check, then evaluate citations using non-sensitive sources.
