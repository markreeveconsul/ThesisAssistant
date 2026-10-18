# Thesa

A thesis-writing workspace built with Next.js, Tiptap and Supabase, with a local-preview Gemini source assistant. The current design adapts the approved Thesa UI source: emerald accents, rounded controls, Manrope interface text, a serif manuscript, Otto illustrations, and chapters/sources beside the editor.

## What works now

- Thesis dashboard, working title, editable research problem, APA/MLA/IEEE preference.
- Five-chapter template or blank outline.
- Real Tiptap editing: headings, bold/italic/underline, lists, block quotes, tables, HTTPS image links with alt text, footnotes, undo/redo, find/replace, word count and a small slash-tool menu.
- Chapter creation, renaming, switching, drag ordering and keyboard-accessible reorder controls.
- Debounced serialized autosave with visible states, revision conflicts, tab recovery and JSON chapter backup downloads.
- Focus mode, floating/docked Otto panel, command palette, mobile reading/editing, light/dark themes. Ctrl/⌘ K toggles Otto; Ctrl/⌘ Shift K opens commands. Escape closes Otto or exits focus mode.
- Supabase auth routes, user-isolated schema and storage policies. Hosted auth and cloud saves still require account setup.

**Source uploads and reading work for browser drafts.** PDF/DOCX/TXT files are parsed by a local Python/FastAPI service and saved in IndexedDB. The reader supports original PDF rendering, page navigation, zoom, text search and original-file download. Source deletion removes the stored file and extracted text. See [source setup and limits](docs/SOURCE_UPLOADS.md).

**Otto source chat is a local preview.** After [AI setup](docs/AI_SETUP.md), Otto uses semantic plus keyword search over the selected project's sources, then Gemini writes a conversational answer grounded in retrieved passages. Follow-up questions use a short in-memory chat context, and each answer shows the original quotation with a clickable file/page location. Unsupported questions abstain; provider errors stay explicit. Chat is not saved, and citation insertion, notes and DOCX/PDF export remain pending.

This Gemini trial uses a hosted proprietary model and does not meet the original open-source AI requirement. Free-tier quotas still apply, and Google may use free-tier prompts to improve its products; use synthetic or non-sensitive material while evaluating it.

## Run locally

**Windows shortcut:** after the one-time dependency setup in [SOURCE_UPLOADS.md](docs/SOURCE_UPLOADS.md), double-click **Start Thesa.bat** in the repository root. It starts the frontend and document parser, then opens `http://127.0.0.1:3002`. No terminal commands are needed for subsequent runs. Keep its status window open; press Enter there to stop the services it started. Existing compatible services are reused and left running. Diagnostic logs are in ignored `.thesa-run/`. The older `Start Thesa.cmd` also remains compatible.

Browser drafts are tied to the exact address: `localhost`, `127.0.0.1` and different ports have separate storage. The launcher consistently uses `127.0.0.1:3002`; it does not move drafts from another address.

Requires Node.js 22+ and npm. The editor alone needs no Python, Ollama or Docker. Source upload/parsing additionally requires the FastAPI service described in [SOURCE_UPLOADS.md](docs/SOURCE_UPLOADS.md).

~~~powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 3001
~~~

Open http://localhost:3001. With both Supabase variables empty, development mode uses **browser drafts**. Create a thesis and write immediately. Drafts persist in that browser's localStorage; they are not a user account, cloud backup or cross-device sync. Clearing browser data removes them. Download important chapter backups. Safe local writes require Web Locks (supported in current mainstream browsers).

Unsaved text is also kept in sessionStorage for same-tab recovery. The editor offers restoration after reload; if the saved revision changed, download the recovered text for comparison instead of silently replacing newer work. Backups are JSON data, not finished DOCX/PDF exports; a backup-import interface is not implemented yet.

A production build without Supabase fails closed by default. Set ALLOW_BROWSER_DRAFTS=true only for an intentional demonstration environment, never as an alternative to authenticated production storage.

## Connect Supabase

Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) to create or select the hosted project, set local Auth redirects, link the CLI and apply the migrations. The Supabase CLI is pinned in `frontend/package.json` so teammates use the same version.

At a high level:

1. Create a Supabase project and copy its project URL and **publishable** key into `frontend/.env.local`.
2. From the repository root, authenticate/link the CLI and apply migrations:
   ~~~sh
   .\frontend\node_modules\.bin\supabase.cmd login
   .\frontend\node_modules\.bin\supabase.cmd link --project-ref YOUR_PROJECT_REF
   .\frontend\node_modules\.bin\supabase.cmd db push
   ~~~
   This applies all three migrations, including the editor revision functions. Existing browser drafts are not migrated automatically.
3. Configure the Auth redirect allow-list and email confirmation in the Supabase dashboard, then restart Next.js.
4. Verify signup, confirmation, login, recovery, two-user isolation and cloud autosave against the hosted project before release.

User-facing routes never use a service-role key. RLS is the final authorization boundary. Source uploads and direct source/project deletion remain denied until their validated processing/cleanup endpoints exist.

## Deploy to Vercel

Choose frontend as the root directory, Next.js framework, npm ci and npm run build. Configure the public Supabase variables and deployed site origin in the appropriate environment. Use a separate Supabase project for destructive preview testing.

No Vercel or hosted Supabase deployment has been performed; the user deferred account setup. Local database-policy tests do not establish that hosted auth/email/storage works.

## Environment

See frontend/.env.example (copy to frontend/.env.local; Next.js does not read the repository-root .env).

| Variables | Purpose |
| --- | --- |
| NEXT_PUBLIC_SITE_URL | Canonical site origin for auth emails |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Hosted database/auth configuration |
| ALLOW_BROWSER_DRAFTS | Explicit opt-in for unauthenticated browser drafts in a production demonstration build; false by default |
| SUPABASE_SERVICE_ROLE_KEY | Future worker credential, server-only; unused in current user routes |
| GEMINI_API_KEY / GEMINI_API_BASE_URL | Backend-only Gemini API key and API base URL |
| AI_CHAT_MODEL / AI_EMBED_MODEL | Swap chat and embedding model IDs without code changes |
| AI_EMBED_DIMENSIONS / AI_RETRIEVAL_MIN_SCORE | Embedding vector size and semantic match threshold |
| MAX_UPLOAD_MB / MAX_PDF_PAGES | Planned ingestion caps: 25 MB / 300 pages |

The active Python AI adapter reads the Gemini settings from **backend/.env**. Never put the key in frontend variables or commit it. See [AI_SETUP.md](docs/AI_SETUP.md) for setup, privacy and quota details.

## Tests

From frontend:

~~~sh
npm test
npm run typecheck
npm run build
npm run test:e2e
~~~

Run build and browser tests sequentially because Next.js updates shared generated type files.

Vitest executes the actual migrations in PGlite and tests authentication-role isolation, column grants, storage policies, atomic project/template creation, revision conflicts and all-or-nothing chapter reordering. Supabase-managed auth/storage plumbing is substituted; its HTTP APIs are not exercised.

Other unit tests cover document validation, word count, search across formatting boundaries and serialized autosave, including edits made during in-flight saves and failures.

Playwright uses an isolated development server on port 3012, real browser storage and a real Tiptap editor. It tests persistence, multiple-tab conflicts, chapter switching/reordering, research-problem changes, formatting, tables/footnotes, mobile layouts and axe accessibility checks. Windows defaults to Edge; elsewhere install Chromium and set PLAYWRIGHT_CHANNEL=chromium.

## Repository

- frontend/: active application and tests.
- supabase/migrations/: SQL schema, grants, RLS and editor functions.
- docs/ARCHITECTURE.md and docs/DESIGN.md: decisions and implementation boundaries.
- backend/document_service/: active local FastAPI parser, with bounded extraction reused from backend/app/services/parsing.py. Other backend/app routes remain legacy and are not connected to this UI.

The original C:\Users\Admin\thesis-assistant checkout is unchanged. Work is in the SisAssist repository on codex/thesisdesk.

## Known limitations and next steps

- Live Supabase/Vercel verification remains pending.
- No private image upload yet; explicit HTTPS image links load from external hosts.
- Footnotes currently use linked dagger markers and an end-of-chapter list. Final export/pagination is not implemented.
- Browser backups are per chapter; bulk import/export and cloud draft migration are not implemented.
- Large-document performance and full assistive-technology review remain final-MVP checks.
- Source uploads currently use browser-local storage and a loopback parser. Authenticated cloud uploads and durable background ingestion remain pending.
- Then: grounded assistant, selected-text/RRL review, accepted suggestions, bibliography, notes and exports.

No OCR, collaboration, sharing, paper discovery, plagiarism checks or unverifiable alignment/AI-detection percentages are included.
