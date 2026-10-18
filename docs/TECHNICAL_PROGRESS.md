# Thesa — Technical Progress

Status snapshot: 19 October 2026

## Overview

Thesa is a thesis workspace being developed into a research consultant and guide. The current application supports manual thesis writing, chapter management, browser-local and authenticated cloud source uploads, document parsing and source reading. Otto's AI consultation flow is documented in [AI setup](AI_SETUP.md).

## Technology stack

| Area | Technology and current use |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS and custom CSS |
| Editor | Tiptap for structured rich-text chapters |
| Document backend | Python, FastAPI and Uvicorn; local parsing service |
| Parsing and viewing | PyMuPDF for PDFs, python-docx for DOCX, UTF-8 TXT parsing, PDF.js for browser PDF rendering |
| Current persistence | localStorage for drafts, sessionStorage for recovery, IndexedDB for sources |
| Cloud persistence | Supabase Auth, project/chapter persistence, private source storage and PostgreSQL RLS/RPC migrations |
| Testing | Vitest, Playwright, axe accessibility checks, pytest and PGlite for local database-policy tests |

## Completed functionality

- **Workspace and UI:** redesigned dashboard and chapter workspace, responsive layouts, light/dark themes, focus mode and floating/docked Otto assistant panel. Otto currently provides the interface, not AI responses.
- **Project and chapter management:** project creation, five-chapter or blank starting structure, editable research problem, chapter creation, renaming and reordering, and citation-style preference selection.
- **Writing tools:** rich-text formatting, lists, tables, HTTPS image links, footnotes, undo/redo, search/replace and word count. Citation-style selection does not generate a bibliography.
- **Draft protection:** serialized autosave, save status, revision-conflict handling, same-tab recovery and downloadable chapter JSON backups.
- **Source library:** PDF/DOCX/TXT selection or drag-and-drop, upload queue, duplicate detection within a project, progress/error reporting and confirmed deletion of source metadata, original file and extracted text. Browser drafts use IndexedDB; signed-in projects use a private Supabase bucket and owner-checked database functions.
- **Source reader:** original PDF rendering, page navigation, zoom, extracted-text search, original-file download and copying text with its filename and location. DOCX/TXT use extracted-text views.
- **Local startup:** double-click `Start Thesa.cmd` after initial dependency setup. It starts both services, opens `http://127.0.0.1:3002`, reuses compatible running services and stops only services it launched when Enter is pressed.

## Document processing flow

```text
Select a source in a project
  -> validate type/size and check duplicate content
  -> POST file to local FastAPI /parse
  -> extract text in a time-limited Python subprocess
  -> return filename, content hash, locations and warnings
  -> browser draft: atomically save original + metadata + text in IndexedDB
  -> cloud project: reserve owner-scoped row -> upload original to private Storage -> save extracted locations via owner-checked RPC
  -> browse the source in the library and reader
```

PDF locations are physical page numbers. DOCX locations are extracted paragraphs/table rows; TXT locations are original line numbers. These are not presented as physical pages. The backend removes temporary parsing files and does not retain documents.

Default limits include 25 MB per file and 300 PDF pages. Validation handles empty, corrupt, encrypted, unsupported and oversized files. Image-only PDFs are rejected with an OCR explanation; partially scanned PDFs produce warnings. Timeouts, offline failures and browser storage failures have user-facing errors. Local origins on ports 3000, 3001, 3002 and 3012 are allowed; the service is not a public authenticated upload API.

## Verification completed

On 19 October 2026, `npm run typecheck`, all 40 frontend unit tests, `npm run build`, and `git diff --check` passed after adding cloud source imports. Tests exercise the migration with PGlite, owner isolation, function privileges, and a mocked cloud upload sequence. The Playwright runner did not start its disposable servers in this environment and was stopped before assertions ran; this is not an end-to-end pass. Earlier runs passed the 18 document-service tests and the launcher startup/readiness/shutdown smoke test.

These are local development checks; they do not verify the hosted Supabase Storage API or a live upload. The older `VERIFICATION.md` describes a legacy Ollama implementation and should not be used as evidence about the current Thesa AI flow.

## Remaining work and limitations

Browser drafts remain tied to the exact host/port; clearing browser data removes them, and chapter backups do not include sources. Cloud source uploads require the `202610190001_cloud_sources.sql` migration and the local FastAPI parser. A hosted parser is not deployed, so cloud imports do not yet work on a Vercel-only deployment. There is no OCR, durable background ingestion, or vector database-backed embedding index yet.

Pending work includes production deployment verification, a hosted parser, durable background ingestion, a persistent embedding index, summaries, notes, bibliography tools and finished DOCX/PDF export. OCR and live collaboration are not implemented. No Vercel production deployment has been verified.

See [setup and source limits](SOURCE_UPLOADS.md), [architecture](ARCHITECTURE.md) and the [README](../README.md) for implementation details.
