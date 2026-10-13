# Thesa — Technical Progress

Status snapshot: 13 October 2026

## Overview

Thesa is a thesis workspace being developed into a research consultant and guide. The current application supports manual thesis writing, chapter management, local source uploads, document parsing and source reading. AI consultation is not yet connected to the current interface.

## Technology stack

| Area | Technology and current use |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS and custom CSS |
| Editor | Tiptap for structured rich-text chapters |
| Document backend | Python, FastAPI and Uvicorn; local parsing service |
| Parsing and viewing | PyMuPDF for PDFs, python-docx for DOCX, UTF-8 TXT parsing, PDF.js for browser PDF rendering |
| Current persistence | localStorage for drafts, sessionStorage for recovery, IndexedDB for sources |
| Cloud foundation | Supabase integration code and PostgreSQL migrations/policies exist; hosted setup and verification are pending |
| Testing | Vitest, Playwright, axe accessibility checks, pytest and PGlite for local database-policy tests |

## Completed functionality

- **Workspace and UI:** redesigned dashboard and chapter workspace, responsive layouts, light/dark themes, focus mode and floating/docked Otto assistant panel. Otto currently provides the interface, not AI responses.
- **Project and chapter management:** project creation, five-chapter or blank starting structure, editable research problem, chapter creation, renaming and reordering, and citation-style preference selection.
- **Writing tools:** rich-text formatting, lists, tables, HTTPS image links, footnotes, undo/redo, search/replace and word count. Citation-style selection does not generate a bibliography.
- **Draft protection:** serialized autosave, save status, revision-conflict handling, same-tab recovery and downloadable chapter JSON backups.
- **Source library:** PDF/DOCX/TXT selection or drag-and-drop, upload queue, duplicate detection within a project, progress/error reporting and confirmed deletion of source metadata, original file and extracted text.
- **Source reader:** original PDF rendering, page navigation, zoom, extracted-text search, original-file download and copying text with its filename and location. DOCX/TXT use extracted-text views.
- **Local startup:** double-click `Start Thesa.cmd` after initial dependency setup. It starts both services, opens `http://127.0.0.1:3002`, reuses compatible running services and stops only services it launched when Enter is pressed.

## Document processing flow

```text
Select a source in a project
  -> validate type/size and check duplicate content
  -> POST file to local FastAPI /parse
  -> extract text in a time-limited Python subprocess
  -> return filename, content hash, locations and warnings
  -> atomically save metadata + original file + text in IndexedDB
  -> browse the source in the library and reader
```

PDF locations are physical page numbers. DOCX locations are extracted paragraphs/table rows; TXT locations are original line numbers. These are not presented as physical pages. The backend removes temporary parsing files and does not retain documents.

Default limits include 25 MB per file and 300 PDF pages. Validation handles empty, corrupt, encrypted, unsupported and oversized files. Image-only PDFs are rejected with an OCR explanation; partially scanned PDFs produce warnings. Timeouts, offline failures and browser storage failures have user-facing errors. Local origins on ports 3000, 3001, 3002 and 3012 are allowed; the service is not a public authenticated upload API.

## Verification completed

Prior implementation runs passed 35 frontend unit tests, the production build, and browser tests covering uploads, parsing, PDF rendering, persistence, project separation, deletion, offline retry and storage-failure rollback. Following the port 3002 correction, all 18 document-service tests passed, including browser-origin/preflight checks. The launcher startup/readiness/shutdown smoke test also passed.

These are recorded development results, not a fresh full-suite run for this document. The older `VERIFICATION.md` describes a legacy Ollama implementation; it does not establish AI functionality in the current Thesa UI.

## Remaining work and limitations

Sources and drafts are browser-local and tied to the exact host/port. Clearing browser data removes them; chapter backups do not include sources. Project filtering is not authenticated user isolation, and cloud-mode source uploads remain disabled.

Pending work includes hosted authentication and database verification, private cloud file storage, authenticated FastAPI deployment, AI retrieval/chat with grounded citations, summaries, notes, bibliography tools and finished DOCX/PDF export. OCR and live collaboration are not implemented. Legacy backend AI routes exist in the repository but are disconnected from the current UI. No Vercel/Supabase production deployment has been verified.

See [setup and source limits](SOURCE_UPLOADS.md), [architecture](ARCHITECTURE.md) and the [README](../README.md) for implementation details.
