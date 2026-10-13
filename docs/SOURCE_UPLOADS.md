# Source uploads and reader

This slice implements non-AI uploads for the current **browser-draft workspace**. It does not create a second account system or silently send documents to a hosted provider.

## Run

Python 3.11+ and the existing Node.js setup are required. In a terminal at the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-documents.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn document_service.main:app --host 127.0.0.1 --port 8000
```

On macOS/Linux use `.venv/bin/python` instead. Leave the backend running. In another terminal:

```powershell
cd frontend
npm ci
npm run dev -- --port 3001
```

Set `NEXT_PUBLIC_DOCUMENT_API_URL=http://127.0.0.1:8000` in the frontend environment if changing the default. Restart Next.js after changing public environment variables. The backend reads optional `backend/.env`; defaults work without copying it. No Ollama, API keys, embeddings, database service, or AI provider is required.

## User flow

The parser permits local frontend ports 3000, 3001, 3002 and the test port 3012, using either `localhost` or `127.0.0.1`. For another port, add its exact origin to `DOCUMENT_ALLOWED_ORIGINS` in `backend/.env` and restart FastAPI. A rejected browser origin can appear as a connection error even when the parser is running.

Open a project, choose **Upload sources**, and select or drop PDF, DOCX or UTF-8 TXT files. The queue accepts up to 10 files and processes them sequentially. It reports real stages, success counts, per-file errors and cancellation. Choose a file again to retry a failure.

- Defaults: 25 MB per file, 300 PDF pages, 2 million extracted characters, 10,000 extracted locations, 50 MB expanded DOCX content.
- PDF locations are physical, one-based pages, which can differ from printed page labels. Blank pages are retained. Fully image-only PDFs are rejected with an OCR explanation; mixed PDFs retain readable pages and show a warning. OCR is not implemented.
- DOCX locations are extracted paragraphs; table rows count as paragraphs. Headers, footers, text boxes and layout pagination are not reconstructed. TXT locations retain original line numbers, including gaps from blank lines. Neither is described as a physical page.
- The reader renders original PDF pages with PDF.js, supports page navigation and zoom, and shows accessible extracted text. DOCX/TXT show text rather than a facsimile. Text search moves between matching locations; it does not search image pixels.
- Original files can be downloaded. Copying text includes its filename and location; it does not insert or validate a citation in the manuscript.
- Duplicate file content is rejected within a project, including renamed files. The same file may be used in another project.
- Deleting a source requires confirmation and atomically removes its metadata, original Blob and extracted text from browser storage. No embeddings or chunks exist in this slice.

## Storage and security boundary

The source catalogue and documents live in IndexedDB (`thesa-sources-v1`), with project-filtered metadata and compound project/hash uniqueness. The existing localStorage manuscript data remains unchanged. Source metadata and document data are saved/deleted together in a transaction; quota failure cannot leave a half-saved source. Other tabs refresh via BroadcastChannel. Keep original files: clearing browser data removes this library, and chapter JSON backups do not include sources.

Project filtering is **not authenticated per-user isolation**. Browser drafts and files are visible to anyone using that browser profile. Cloud-mode source uploads are explicitly disabled until authenticated storage is integrated.

The browser sends the file to the configured local FastAPI `/parse` endpoint. The service validates the extension, PDF/DOCX signature, byte cap and allowed local origin. A disposable subprocess performs parsing under a hard timeout. Temporary files and extracted results are removed after success/failure; no source is retained on the backend. Two concurrent parse requests are allowed, with excess requests rejected for retry. Text is rendered as text, not HTML or instructions.

The service binds to loopback in the documented commands and rejects non-loopback clients, unexpected Host headers and uploads without an allowed Origin. It is a local development service, not a public authenticated file API. Do not proxy or publish it as-is. Hosted FastAPI deployment needs verified user identity, project authorization, quotas/rate limits, durable private object storage and deletion lifecycle integration before cloud uploads are enabled.

## Verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest document_tests -q
cd ../frontend
npm test
npm run test:e2e
npm run build
```

Playwright starts its own real FastAPI service on port 8012 and generates test files under ignored `frontend/.source-test-fixtures/`. The frontend test server uses port 3012. Install the Python environment before running browser tests. Tests cover actual PDF/DOCX/TXT parsing, scan/encryption/corruption/limits, local request boundaries, offline retry, PDF rendering, project filtering, reload persistence and deletion of both stored blobs and extracted data. Browser contexts are isolated from real drafts.
