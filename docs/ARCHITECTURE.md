# ThesisDesk architecture

## Status

This document separates implemented foundation from planned pipeline. Milestones 1–2 use Next.js App Router, strict TypeScript, Tailwind CSS, Radix Dialog, self-hosted fonts and Supabase SSR. The Tiptap editor and browser-draft ingestion are implemented. Otto's local source-question preview now uses Gemini embeddings for semantic retrieval and Gemini chat to select validated source quotations. Account setup and Vercel deployment remain deferred.

The existing Git history was imported into the previously empty SisAssist workspace. The original thesis-assistant checkout remains unchanged. The legacy Python API routes remain disconnected. The active document_service reuses the bounded Python parser without importing Ollama or vector-store code. See SOURCE_UPLOADS.md for the implemented local storage and request boundaries.

## Runtime and trust boundaries

Browser → Next.js server components/actions → Supabase using the user's authenticated cookie session. getUser verifies the session with Supabase; middleware refreshes cookies. No service-role key is used in user-facing foundation routes. Server actions validate input with Zod and derive owner IDs from the authenticated user.

Database RLS is the final boundary, including direct browser/API requests. A project ID is only a selector, never authorization. Auth redirects use an exact destination allowlist. Dynamic authenticated pages and middleware responses must not be publicly cached.

When public Supabase variables are absent, development mode offers explicitly labeled browser drafts in localStorage; auth forms are disabled. Browser drafts have no account isolation or cloud backup. Production requires Supabase unless ALLOW_BROWSER_DRAFTS=true explicitly enables a demonstration. Adding configuration switches to authenticated storage; browser drafts are not automatically imported. Partially configured credentials should be treated as a configuration error (see config validation).

## Implemented data model

- profiles: owner is auth.users.id; private preferences.
- projects: owner, title, research problem, bibliography style, starting structure, revision, timestamps, deletion tombstone.
- sections: project-owned editor JSON, title/order, parent, revision. Composite parent/project foreign key blocks cross-project hierarchy links.
- sources: server-controlled upload reservation, immutable storage path, status, PDF metadata, deletion tombstone.
- source_pages: project/source composite FK, physical page, extracted text and position mapping.
- notes: project-owned rich content.
- jobs: project-owned status, checkpoint, lease and retries. Browser read-only.

Every application table has ENABLE and FORCE ROW LEVEL SECURITY. Browser grants are explicit. Project owner/tombstone fields and all ingestion fields are not client-updatable. Project/source deletion has no direct browser grant; later workers will coordinate storage cleanup before final row deletion.

private.owns_project is SECURITY INVOKER with a fixed empty search path. It requires both the authenticated owner and an active project. Profiles/sections/notes have owner-limited mutations; source/pages/jobs are read-only for authenticated callers.

Private buckets: sources, assets, exports. A source upload requires a reserved source row owned by the user and the exact storage path. No source overwrite policy. Assets and exports are deny-by-default until dedicated metadata/lifecycle policies exist. No public URLs.

## Implemented local ingestion and remaining cloud plan

Browser files -> loopback FastAPI validation -> time-limited Python parser process -> extracted locations -> atomic IndexedDB metadata/file/text save -> project-scoped source library and PDF.js/text reader. During a source question, the local backend batches Gemini embedding requests and keeps vectors in a bounded process-memory cache. No source text or vector is persistently stored by this preview. Authenticated cloud-mode uploads remain disabled.

The older cloud-ingestion proposal below is not implemented and must be revised around the agreed Python/FastAPI backend before deployment.

## Earlier cloud ingestion proposal

Authorize/reserve → signed direct browser upload to Storage → verify stored object size and signature → durable Supabase queue → bounded Vercel Node worker → extract page batches → token chunks with overlap → batched hosted open-weight embeddings → pgvector index → ready.

Use page/extraction checkpoints, stable chunk IDs, idempotent upserts, leases, bounded retries and a scheduled dispatcher. A browser closing or a Vercel invocation timing out must not lose a job. Jobs check deletion generation/state before committing, preventing source resurrection. Storage and database updates are not one distributed transaction.

Plan 25 MB and 300 physical pages initially. Detect corrupt, encrypted, empty, scanned and partially scanned PDFs. Preserve position mappings and distinguish physical page index from printed page label. Multi-page chunk evidence must map to exact supporting pages. Progress reports actual stages/counts, not invented percentages.

Version embedding model ID, dimensions and preprocessing. Index one profile at a time; model changes require re-embedding and a deliberate index switch. Planned dimensions: 1024. Add the vector extension, HNSW index and authenticated SQL retrieval function with Milestone 3.

## Planned assistant (Milestones 4–5)

The local preview is documented in [AI_SETUP.md](AI_SETUP.md). It embeds page-local chunks with `gemini-embedding-2`, caches up to 5,000 vectors by project/source content in process memory, combines semantic matches with keyword results, and sends up to five passages to `gemini-3.6-flash`. The model writes a conversational answer and selects supporting evidence IDs; the server validates those IDs and streams the answer with original quotations and resolved source locations. The browser checks quotations against its own project sources before displaying them. The four latest messages stay in browser memory for follow-ups and are not persisted; answers and vectors are temporary. This hosted proprietary Gemini trial departs from the original open-source AI requirement and is not ready for sensitive research data or public deployment.

`GEMINI_API_KEY`, `GEMINI_API_BASE_URL`, `AI_CHAT_MODEL`, `AI_EMBED_MODEL`, dimensions and the similarity threshold are backend environment settings. There is no paid-model fallback or automatic retry. Free-tier quotas remain, and citations still need human relevance checks. Hosted account isolation, durable vectors, persistent chat and live-model quality evaluation remain pending.

Research path: authorize project → persist/rate-limit request → embed query → SQL retrieval under owner/project filters → prompt with untrusted evidence → generate → validate source markers and passage offsets → stream segments → persist canonical citations.

Document text and user draft context cannot issue instructions or tool actions. Model output is never trusted as a file/page locator. Provenance validation cannot prove semantic entailment; evaluations cover relevance, unsupported synthesis, abstention and document prompt injection.

Writing review path: explicitly selected draft text → feedback or proposed diff → user acceptance. Draft is context, not evidence. RRL review covers structure, synthesis and clarity; source checking requires uploaded papers. No unsupported claim of a field-wide research gap.

## Implemented editor and planned deletion

Tiptap provides rich text, tables, HTTPS image links, footnotes, search/replace and a slash menu. Debounced autosave serializes writes and shows Saved only after acknowledgment. Compare-and-swap revisions prevent silent overwrites. PostgreSQL triggers enforce revision increments; SECURITY INVOKER functions create project/templates and reorder chapters atomically under RLS. Browser draft mutations use Web Locks and the same revision checks. Unsaved edits have same-tab sessionStorage recovery and downloadable JSON backups. Navigation flushes pending edits before switching chapters. Images and links are validated; editor JSON has size/depth/node limits.

Citation and suggestion extensions, automatic bibliographies, backup import and DOCX/PDF serializers remain planned. Proposed writing changes will retain their target revision and require acceptance.

Bibliographic metadata is user-confirmed; unknown authors/dates are never invented. Source deletion tombstones access, cancels jobs, removes stored objects/vectors and scrubs citation references in editor/chat/notes. Retain student prose with an explicit removed-citation marker.

## Verification boundaries

PGlite executes these exact SQL migrations against real PostgreSQL RLS, with test-only Supabase auth/storage stubs. This verifies policy predicates, grants and relational integrity. It does not verify GoTrue, email, signed URLs, Storage HTTP, Realtime or hosted pgvector behavior. Those require a connected Supabase environment.

Browser tests exercise real browser drafts and Tiptap: reload persistence, chapter switching/reordering, two-tab conflicts, research problem editing, tables/footnotes, mobile layout and accessibility. Hosted auth acceptance and upload-to-citation E2E remain release gates for later milestones.
