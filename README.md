# Thesa

A thesis-writing workspace built with Next.js, Tiptap and Supabase, with hosted open-weight research assistance planned next. The current design adapts the approved Thesa UI source: emerald accents, rounded controls, Manrope interface text, a serif manuscript, Otto illustrations, and chapters/sources beside the editor.

## What works now

- Thesis dashboard, working title, editable research problem, APA/MLA/IEEE preference.
- Five-chapter template or blank outline.
- Real Tiptap editing: headings, bold/italic/underline, lists, block quotes, tables, HTTPS image links with alt text, footnotes, undo/redo, find/replace, word count and a small slash-tool menu.
- Chapter creation, renaming, switching, drag ordering and keyboard-accessible reorder controls.
- Debounced serialized autosave with visible states, revision conflicts, tab recovery and JSON chapter backup downloads.
- Focus mode, floating/docked Otto panel, command palette, mobile reading/editing, light/dark themes. Ctrl/⌘ K toggles Otto; Ctrl/⌘ Shift K opens commands. Escape closes Otto or exits focus mode.
- Supabase auth routes, user-isolated schema and storage policies. Hosted auth and cloud saves still require account setup.

**Sources and the assistant are not connected yet.** Their UI states say so. Uploading, PDF evidence viewing, retrieval, AI answers, citations, notes and DOCX/PDF export remain later milestones.

## Run locally

Requires Node.js 22+ and npm. No Python, Ollama or Docker is required for the UI.

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

1. Create a new Supabase project and install/sign into its CLI.
2. From the repository root:
   ~~~sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ~~~
   Apply all three migrations, including the editor revision functions. Existing development SQLite data is not migrated.
3. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and NEXT_PUBLIC_SITE_URL in frontend/.env.local.
4. Configure exact Auth redirect URLs for /auth/callback (including password-recovery redirects), enable email confirmation and a minimum password length of 12, and set up production SMTP.
5. Restart Next.js. The dashboard now requires a verified session and uses Postgres; browser drafts are not automatically imported into a cloud account.
6. Verify signup, confirmation, login, recovery, two-user isolation and real cloud autosave against that hosted project before release.

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
| AI_CHAT_BASE_URL / AI_CHAT_API_KEY / AI_CHAT_MODEL | Future open-weight chat configuration |
| AI_EMBED_BASE_URL / AI_EMBED_API_KEY / AI_EMBED_MODEL / AI_EMBED_DIMENSIONS | Future versioned embedding configuration |
| MAX_UPLOAD_MB / MAX_PDF_PAGES | Planned ingestion caps: 25 MB / 300 pages |

AI variables are reserved for later milestones; no model requests happen yet.

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
- backend/: preserved legacy FastAPI code, unused by the new application.

The original C:\Users\Admin\thesis-assistant checkout is unchanged. Work is in the SisAssist repository on codex/thesisdesk.

## Known limitations and next steps

- Live Supabase/Vercel verification remains pending.
- No private image upload yet; explicit HTTPS image links load from external hosts.
- Footnotes currently use linked dagger markers and an end-of-chapter list. Final export/pagination is not implemented.
- Browser backups are per chapter; bulk import/export and cloud draft migration are not implemented.
- Large-document performance and full assistive-technology review remain final-MVP checks.
- Next: direct PDF upload, resumable ingestion, source processing statuses and evidence viewer.
- Then: grounded assistant, selected-text/RRL review, accepted suggestions, bibliography, notes and exports.

No OCR, collaboration, sharing, paper discovery, plagiarism checks or unverifiable alignment/AI-detection percentages are included.
