# ThesisDesk

An editor-first thesis workspace being rebuilt on Next.js, Supabase and hosted open-weight inference. Library Folio is the selected design direction.

## Current milestone

Milestone 1 foundation is implemented locally: responsive three-pane shell, light/dark themes, focus mode, keyboard command palette, assistant resizing, Supabase SSR auth routes, project creation/loading, database migrations, ownership policies, private storage policies and tests.

**Without Supabase configuration the app is a clearly labeled, read-only layout preview.** Sample paragraphs are illustrative; they are not AI answers. Preview projects are temporary and reset on reload. Document editing, uploads, ingestion, AI, citations, notes and export are later milestones. No model requests are made yet.

Hosted Supabase authentication, email, Storage API behavior and Vercel deployment are pending account setup. A passing local policy test is not a hosted acceptance test.

## Run the current app

Requires Node.js 22 LTS and npm. No Python, Ollama or Docker is required for this preview.

~~~powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev -- --port 3001
~~~

Open http://localhost:3001. Keep the Supabase variables empty to explore the preview. The new workspace is separate from the original app at C:\Users\Admin\thesis-assistant.

## Connect Supabase later

1. Create a Supabase project. Keep its service-role key out of browser variables.
2. Install/sign into the Supabase CLI. From the repository root, link the project and apply the migrations:
   ~~~sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ~~~
   Use a new project; this migration does not import the legacy SQLite data.
3. In frontend/.env.local set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and NEXT_PUBLIC_SITE_URL.
4. Configure Supabase Auth's site URL and allowed redirect URLs for the exact deployment origin, including /auth/callback and recovery callbacks. Enable email confirmation and a minimum password length of 12. Configure production SMTP before public signup.
5. Restart Next.js. The root now requires a real verified session. Signup, confirmation, login, recovery and project creation must then be tested against the hosted project.
6. New projects are saved in Postgres. The manuscript area remains read-only until Milestone 2.

Migrations create seven application tables with RLS: profiles, projects, sections, sources, source_pages, notes and jobs. Browser roles cannot mutate ingestion state or directly delete projects/sources. Assets and exports remain deny-by-default until their lifecycles are implemented.

Do not disable RLS to fix an access error. Policies are tested and their failure is meaningful.

## Deploy to Vercel later

Import this repository and choose **frontend** as the root directory and Next.js as the framework. Use npm ci and npm run build. Set the same public Supabase variables and the deployed site URL in the appropriate Preview/Production environments. No local backend is needed.

Preview deployments should use a separate Supabase project from production when testing destructive behavior. Configure exact allowed auth redirects. No Vercel deployment was created during this milestone.

## Environment variables

Next.js reads frontend/.env.local, not the repository-root .env. See frontend/.env.example.

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_SITE_URL | Canonical site origin for auth emails |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL; blank enables preview |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public, RLS-limited browser key |
| SUPABASE_SERVICE_ROLE_KEY | Reserved for future privileged workers; server-only |
| AI_CHAT_BASE_URL / AI_CHAT_API_KEY / AI_CHAT_MODEL | Future open-weight chat provider |
| AI_EMBED_BASE_URL / AI_EMBED_API_KEY / AI_EMBED_MODEL | Future open-weight embedding provider |
| AI_EMBED_DIMENSIONS | Planned vector dimension, default 1024 |
| MAX_UPLOAD_MB / MAX_PDF_PAGES | Planned ingestion bounds, 25 MB / 300 pages |

The AI and worker variables are documented configuration for later milestones and are not consumed yet. There is no proprietary-model fallback.

## Tests

From frontend:

~~~sh
npm test
npm run typecheck
npm run build
npm run test:e2e
~~~

- Vitest runs input validation and the actual SQL migrations in PGlite (PostgreSQL in WASM). Auth identities, service roles, and the storage schema are test substitutes; PostgreSQL grants and RLS enforcement execute for real.
- Playwright launches an isolated Next.js preview on port 3012 with empty Supabase configuration. Microsoft Edge is the Windows default. For another environment install Chromium with npx playwright install chromium and set PLAYWRIGHT_CHANNEL=chromium.
- Tests cover preview honesty, navigation, theme persistence, focus, keyboard resizing, command search, mobile layout, offline messaging and invalid auth callbacks.
- A hosted two-user auth/storage acceptance test and the full upload → ask → cited answer → insertion test will be added/run as the corresponding services become available.

## Layout

- frontend/: active Next.js app and tests.
- supabase/migrations/: schema and security policies.
- docs/ARCHITECTURE.md: architecture, trust boundaries, planned pipeline.
- docs/DESIGN.md: design rationale and interaction rules.
- backend/: legacy FastAPI app preserved for reference; unused by ThesisDesk.
- frontend/lib/api.ts and components/SourcePreview.tsx: legacy modules, unused by the new routes.

## Known limitations and next steps

1. Connect hosted Supabase and Vercel; verify live signup, recovery, private files and deployment.
2. Milestone 2: real Tiptap editor, chapter management, outline, revision-aware autosave and word count.
3. Milestone 3: direct upload, durable ingestion, pgvector and PDF evidence viewer.
4. Milestone 4: grounded streaming, citations, history and persistent rate limits.
5. Milestone 5: accepted insertion, bibliography and selected-text/RRL review.
6. Milestone 6: exports, notes, cleanup workers, accessibility and performance.

No collaboration, version history, paper discovery, plagiarism checking or OCR is included. Word-like editing does not promise Microsoft Word-identical pagination.

The original local app's documentation and working baseline remain in Git history before branch codex/thesisdesk.
