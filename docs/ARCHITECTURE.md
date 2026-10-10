# Architecture

## Runtime and trust boundaries

The Next.js frontend calls a FastAPI API with an expiring bearer token. Argon2id hashes passwords. SQLAlchemy/SQLite stores identity and ownership; persistent Chroma stores only chunk text, embeddings, and retrieval metadata. Ollama supplies local chat and embedding inference. There are no proprietary AI SDKs or endpoints.

The API binds to loopback by default. Run one worker: project-level mutation locks serialize upload/deletion, and startup can recover unfinished ingestion records under that assumption. Chroma filtering supplements, but does not replace, SQL ownership authorization.

## Ingestion

1. Authorize the caller against the project's owner.
2. Sanitize the display filename, validate extension/signature, enforce byte limits, and check the SHA-256 duplicate constraint per project.
3. Extract PDF pages with PyMuPDF; reject encrypted/image-only documents and warn about mixed scans. Extract DOCX body paragraphs/table rows with python-docx, and UTF-8 TXT lines. Apply PDF page, expanded ZIP, extracted text, and chunk limits.
4. Chunk each locator independently with overlapping generic-token windows. PDF chunks retain physical page numbers; DOCX/TXT retain paragraph/line numbers.
5. Create a processing source row and save original bytes under generated IDs. Embed in batches of 32 through Ollama and persist Chroma metadata (`project_id`, `file_id`, `filename`, `page`, `locator_type`). Mark ready only after indexing succeeds.
6. On failure, mark failed and attempt vector/file cleanup. Delete the SQL row only after cleanup succeeds. Otherwise retain it for a retry or explicit deletion. Ready-only evidence selection prevents incomplete sources reaching chat.

The legacy `page` metadata/API field contains the locator number for every format; `locator_type` determines whether it means page, paragraph, or line.

## Retrieval, generation, streaming

The API resolves project ownership before retrieval. Chroma queries filter by project and, for summaries, file **before** top-k selection. Cosine distance provides a configurable relevance cutoff. Retrieved entries must also correspond to ready SQL source records.

The model receives numbered JSON evidence and a system instruction to treat documents as data. It is asked to copy one exact source sentence per line. Complete lines are buffered and structurally validated: missing, malformed, or unknown evidence IDs reject the segment. Each generated sentence must also match a complete sentence in every cited excerpt after whitespace/case normalization; invented paraphrases and phrases stripped from a negation are rejected. Accepted references are replaced inline with server-owned file/locator labels, and SSE token events deliver only accepted segments. An empty result yields the exact abstention text. The final SSE event carries the answer, canonical citation objects, and conversation ID; only successful completions are persisted.

Streaming validation checks source text, reference provenance, and citation placement. This extractive MVP cannot prove a quotation answers the question, establish the truth of the original document, or eliminate document prompt injection. This limitation is explicit in the README and should be part of model evaluation.

Ollama exceptions/timeouts and retrieval failures return actionable errors. Output length and generation time are bounded. Both chat and summaries share generation code, avoiding divergent validation behavior. Summaries retrieve aim/method/findings/limitations separately with a bounded combined context, then ask four individual section questions. The server adds section labels and honest abstentions for missing sections.

## Data model

| Entity | Fields and relationships |
| --- | --- |
| User | UUID, unique normalized email, password hash; owns projects |
| Project | UUID, owner FK, name; owns sources, conversations, notes |
| SourceFile | UUID, project FK, filename, path, type, SHA-256, status, warning |
| Conversation | UUID, project FK; owns messages |
| ChatMessage | UUID, conversation FK, role, content, citation JSON, timestamp |
| Note | UUID, project FK, title, content, citation JSON |
| Chroma chunk | Unique ID, text/vector, project/file IDs, locator metadata |

SQLite foreign keys are enabled in application and test connections. Project deletion cascades SQL children. File deletion removes its vector records, original bytes, and SQL row. Existing notes/history are retained after individual file deletion and their old citations become unavailable. Project deletion removes those records as well.

Deletion marks files deleting before touching external stores. Failure retains records for retry; operations are not atomically committed across the three stores. Upload/delete operations for the same project are serialized within the one API process.

## Model changes and persistence

URL, chat model, and embedding model come from environment settings. The vector collection carries an embedding-model stamp. A mismatch or unstamped nonempty legacy collection refuses retrieval/indexing until `python -m app.reindex` rebuilds from original uploads. Stop the API before reindexing. Incomplete rebuilds leave unfinished rows failed and can be retried. Embedding-model changes must never mix incompatible vector spaces.

## Frontend

The workspace loads projects, source status, notes, and persisted history. A shared SSE reader handles chat and summaries and rejects incomplete streams. A private source preview fetches original PDF bytes with authorization, creates a browser blob URL, and navigates to the cited page; blob URLs are revoked when the preview closes. DOCX/TXT locators show authenticated extracted text. No bearer tokens are placed in source URLs.

## Tests and layout

`backend/tests/` covers parsing, chunking, citation validation, auth/isolation, indexing recovery, deletion, reindexing, and API integration. `test_live_ollama.py` opts into real inference. `frontend/tests/` contains a Playwright test using isolated local servers, synthetic PDFs, and real Ollama. The browser harness uses separate temporary database/upload/index directories and separate Next.js build output.

```text
backend/app/api/routes/     HTTP endpoints
backend/app/core/           Configuration, hashing, tokens
backend/app/db/             Engine, sessions, schema initialization/recovery
backend/app/models/         SQL entities
backend/app/services/       Extraction, chunking, vector store, RAG, streaming, locks
backend/app/reindex.py      Explicit offline vector rebuild
frontend/app/               Workspace and styling
frontend/components/        Source preview
frontend/lib/               Typed API, SSE, locator helpers
frontend/tests/             Browser acceptance and synthetic sources
docs/                       Architecture and verification notes
```
