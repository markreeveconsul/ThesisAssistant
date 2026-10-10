# ThesisAssistant

A local-first thesis workspace built with Next.js, FastAPI, SQLite, persistent Chroma, and open-weight models served by Ollama. No proprietary inference API is used.

Create an account and project, upload PDF/DOCX/TXT sources, ask questions, open cited source locations, generate document summaries, and save answers as notes.

## Setup (Windows PowerShell)

Prerequisites: Python 3.11+, Node.js 20.9+, and Ollama. Install Ollama from https://ollama.com/download/windows, then open a new terminal:

```powershell
ollama pull qwen2.5:3b
ollama pull nomic-embed-text
ollama list
```

The default chat model is modest enough to try on a 16 GB machine. CPU generation can be slow. Model licenses differ: review the license for whichever open-weight model you configure.

From the repository root:

```powershell
Copy-Item .env.example .env
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[test]"
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
```

Put the generated value in `SECRET_KEY` in the root `.env`. Do not commit `.env`. Keep `APP_ENV=development` for this local setup; non-development environments reject known placeholder or short secrets.

Start the backend from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, from `frontend/`:

```powershell
npm ci
npm run dev
```

Open http://localhost:3000. The API health endpoint is http://localhost:8000/health and API documentation is http://localhost:8000/docs. Health confirms the API is alive, not that Ollama models are loaded.

On macOS/Linux use `python3 -m venv .venv`, `.venv/bin/python`, and `cp` instead of the PowerShell equivalents. Ollama must be running (`ollama serve` if it is not already running as an application/service).

## Configuration

Backend configuration loads the root `.env`. Relative storage paths resolve against `backend/`. Set browser configuration in `frontend/.env.local` when needed; the frontend does not read the root `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | `development` | Local development mode |
| `SECRET_KEY` | development placeholder | Replace with a random signing secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime |
| `DATABASE_URL` | `sqlite:///./data/thesis_assistant.db` | Application database |
| `UPLOAD_DIR` | `./uploads` | Original sources |
| `CHROMA_DIR` | `./chroma` | Persistent vector index |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama inference endpoint |
| `OLLAMA_CHAT_MODEL` | `qwen2.5:3b` | Open-weight chat model |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model |
| `OLLAMA_TIMEOUT_SECONDS` | `120` | Model request/response deadline |
| `MAX_UPLOAD_MB` | `25` | Per-file byte limit |
| `MAX_PDF_PAGES` | `1000` | PDF page limit |
| `MAX_EXTRACTED_CHARS` | `2000000` | Extracted text limit |
| `MAX_DOCX_EXPANDED_MB` | `100` | Expanded DOCX archive limit |
| `MAX_CHUNKS` | `10000` | Per-source chunk limit |
| `CHUNK_SIZE_TOKENS` / `CHUNK_OVERLAP_TOKENS` | `700` / `100` | Approximate token windows |
| `RETRIEVAL_TOP_K` | `5` | Retrieval limit per query |
| `MIN_RELEVANCE_DISTANCE` | `0.75` | Maximum accepted cosine distance; lower is stricter |
| `CORS_ORIGINS` | `http://localhost:3000` | Allowed browser origins, comma-separated |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Frontend-only API URL |

Changing the chat model only requires pulling it, updating configuration, and restarting. Changing the embedding model requires rebuilding existing vectors:

```powershell
# Stop the backend first, update .env, pull the new embedding model, then:
cd backend
.\.venv\Scripts\python.exe -m app.reindex
```

This rebuilds the entire local index from the original uploads, including all users' documents. It preserves source IDs, notes, and history. An interrupted rebuild leaves unfinished files unavailable; fix the failure and rerun the command. Existing indexes without an embedding-model stamp also require this rebuild. Keep a backup of the database, uploads, and Chroma directory before maintenance.

## Source locators and grounding

PDF citations use physical one-based PDF pages. DOCX citations use extracted paragraph numbers, counting table rows as paragraphs. TXT citations use original line numbers. The UI labels these honestly; DOCX/TXT are not presented as physically paginated documents.

A citation opens the authenticated original PDF at its page, with extracted text available below. DOCX/TXT citations open the corresponding extracted paragraph or line. Deleted sources show an unavailable-source error. Historical answers and notes remain after deleting an individual source; deleting a project removes its history and notes too.

Document text is untrusted input. The prompt separates it from instructions. The server buffers complete answer lines, rejects missing/malformed/out-of-range citations, and requires each answer sentence to match a complete sentence in every cited excerpt (normalizing whitespace and case). It replaces accepted IDs with canonical file/locator metadata before streaming. Answers and section summaries are extractive quotations, not free paraphrases; unsupported text is discarded. An answer with no accepted evidence returns exactly `I can't find this in your documents.`

**Grounding is extractive, not semantic proof.** The model selects source sentences; the server verifies their presence and locators. A selected quotation can still be irrelevant, misleading in context, or factually wrong in the original document. Check the source page for consequential claims. Document text remains untrusted.

## Tests

Fast deterministic tests, using isolated SQLite/Chroma storage and mocked inference:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Live Ollama acceptance test (three PDFs, correct cited page, and an unanswerable question):

```powershell
$env:RUN_OLLAMA_TESTS='1'
.\.venv\Scripts\python.exe -m pytest tests/test_live_ollama.py -q
Remove-Item Env:RUN_OLLAMA_TESTS
```

Frontend checks:

```powershell
cd frontend
npm run lint
npm run build
npm audit
```

`lint` currently runs the TypeScript checker, not ESLint.

Browser acceptance test, with Ollama running and both models pulled:

```powershell
cd frontend
npx playwright test
```

This launches disposable servers on ports 8011 and 3011 with temporary database/upload/index paths. It signs up, uploads three synthetic PDFs, asks questions, opens the cited PDF page, saves a note, reloads history, and deletes source/project data. Edge is the default test browser on Windows. For Chromium use `npx playwright install chromium`, set `PLAYWRIGHT_CHANNEL=chromium`, and rerun. Set `TEST_PYTHON` if the backend virtual environment is elsewhere. The live API test is opt-in in the ordinary pytest suite; browser tests always require real Ollama.

## Known limitations and next steps

- Run **one API worker**. Project mutation locks and startup recovery assume a single process. This is an MVP for local use, not a hardened multi-worker deployment.
- Indexing happens within the upload request. The UI shows progress by file; large files may take minutes. PDF text/ZIP expansion limits do not replace deployment-level request-body/time limits.
- OCR is out of scope. Image-only PDFs are rejected; mixed scanned/text PDFs warn about unreadable pages. Password-protected PDFs are rejected.
- DOCX body paragraphs and top-level table rows are extracted. Headers, footnotes, images, and nested-table structure are not fully represented.
- Chunk token counts use a generic tokenizer, so they approximate the selected model's tokens. Retrieval thresholds need calibration for real thesis collections.
- Summaries use bounded retrieval and four separate section questions; they are not an exhaustive reading of every page. Unsupported summary sections are labelled unavailable.
- Each chat question is answered independently from retrieved evidence. History is saved and displayed, but prior turns are not used to interpret ambiguous follow-up questions.
- Bearer tokens live in browser local storage and expire. Local storage/database files are unencrypted. Before remote deployment, revisit session handling, HTTPS, rate limits, schema migrations, and request limits.
- If the API crashes during indexing, startup marks interrupted uploads failed so they can be retried or deleted. Deletion across SQLite, files, and Chroma is retryable, not a single atomic transaction.
- No citation export, paper discovery, or writing feedback is implemented. Those remain outside the approved MVP.
