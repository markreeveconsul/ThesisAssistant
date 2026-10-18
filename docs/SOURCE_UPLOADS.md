# Source uploads and reader

PDF, DOCX and UTF-8 TXT imports are parsed by the local Python/FastAPI document service. Browser-draft projects save original files and extracted text in IndexedDB. Signed-in projects save originals in a private Supabase Storage bucket and extracted locations in owner-protected Supabase tables.

## Start the local parser

On Windows, finish the one-time Python setup described below, then double-click **Start Thesa.bat**. It starts the frontend and document parser together at `http://127.0.0.1:3002`.

For manual setup, Python 3.11+ and Node.js are required. From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-documents.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn document_service.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev -- --port 3001
```

Set `NEXT_PUBLIC_DOCUMENT_API_URL=http://127.0.0.1:8000` in the frontend environment only if changing the default. Restart Next.js after changing public environment variables. The backend reads optional `backend/.env`; defaults work without copying it. No Ollama, API key, embedding model, or separate database service is needed for importing and reading sources.

## Enable cloud source imports

For an existing Supabase project, apply the pending migration from the repository root after linking this checkout to that project:

```powershell
.\frontend\node_modules\.bin\supabase.cmd db push
```

This records the migration in Supabase's migration history. The latest migration, `202610190001_cloud_sources.sql`, adds source checksums, formats, warnings, page locator types, DOCX/TXT bucket MIME types, owner-checked database functions, and a private Storage deletion policy. It does not require a service-role key.

For a new project, `db push` applies all migrations; for an already-linked project, it applies only pending migrations. Then restart Thesa and use `http://127.0.0.1:3002`. The launcher starts the local parser automatically. Cloud uploads store the original file and extracted locations in Supabase; browser drafts continue to store source data only on that device.

## Import behavior

Choose **Upload sources** and select or drop files. The queue accepts up to 10 files at a time and processes them sequentially. It shows progress, per-file errors, completion counts, and cancellation. Choose a failed file again to retry it.

- Maximum 25 MB per file, 300 PDF pages, 2 million extracted characters, 10,000 extracted locations, and 50 MB expanded DOCX content.
- PDF locators are physical, one-based pages, which may differ from printed labels. Blank pages are retained. Image-only PDFs are rejected with an OCR explanation; mixed PDFs retain readable pages and warn about textless pages. OCR is out of scope.
- DOCX locators are extracted paragraphs; table rows count as paragraphs. Headers, footers, text boxes and pagination are not reconstructed.
- TXT locators preserve original line numbers, including gaps from blank lines.
- The reader renders PDF pages with PDF.js, supports page navigation, zoom, and text search, and shows accessible extracted text. DOCX/TXT are shown as text, not facsimiles. Search does not inspect image pixels.
- The original file can be downloaded. Deletion requires confirmation and removes its stored original and extracted locations.
- Duplicate file content is rejected within a project, including renamed files. The same file can be used in another project.
- Source chunks, embeddings, and AI summaries are not created by this import pipeline.

## Storage and deployment boundary

Browser-draft source data lives in IndexedDB (`thesa-sources-v1`) and disappears if browser data is cleared. Browser-draft project filtering is not authenticated per-user isolation; files are visible to anyone using that browser profile.

Cloud source files live in a private Supabase bucket. Metadata and extracted text use RLS-protected tables. Upload reservation, completion, cancellation, and deletion use owner-checked RPCs; browser clients never receive a service-role key. Thesa checksums files to catch duplicates and validates the parser response before saving it.

The parser binds to loopback and rejects non-loopback clients, unexpected Host headers and unapproved local origins. It uses a disposable process with a hard timeout, and does not keep parser temp files after a request. This is a local development service, not a public authenticated upload API. Local cloud imports require the user to run the provided launcher, which starts the parser.

A Vercel deployment cannot reach a user's `127.0.0.1`. Hosted use still needs a separately deployed parser with verified user identity, project authorization, quotas and rate limits. The current hosted deployment path has not been completed or tested.

## Verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest document_tests -q
cd ../frontend
npm test
npm run test:e2e
npm run build
```

Playwright starts an isolated FastAPI service on port 8012 and a frontend on port 3012. Tests cover PDF/DOCX/TXT extraction, scanned/corrupt/oversized files, offline retry, PDF reading, browser persistence, project separation and local storage cleanup. PGlite executes the SQL migrations to test owner isolation and cloud source functions; it substitutes for Supabase's managed HTTP Auth/Storage services, which are not called by unit tests.
