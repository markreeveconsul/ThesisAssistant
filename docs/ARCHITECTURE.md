# ThesisDesk architecture

## Status

This document separates implemented foundation from planned pipeline. Milestone 1 uses Next.js App Router, strict TypeScript, Tailwind CSS, Radix Dialog, self-hosted fonts and Supabase SSR. It makes no inference calls and has no ingestion or editor implementation yet. Account setup and Vercel deployment were explicitly deferred by the user.

The existing Git history was imported into the previously empty SisAssist workspace. The original thesis-assistant checkout remains unchanged. The legacy Python backend is reference material only.

## Runtime and trust boundaries

Browser → Next.js server components/actions → Supabase using the user's authenticated cookie session. getUser verifies the session with Supabase; middleware refreshes cookies. No service-role key is used in user-facing foundation routes. Server actions validate input with Zod and derive owner IDs from the authenticated user.

Database RLS is the final boundary, including direct browser/API requests. A project ID is only a selector, never authorization. Auth redirects use an exact destination allowlist. Dynamic authenticated pages and middleware responses must not be publicly cached.

When public Supabase variables are absent, the root renders a read-only preview and auth forms are disabled. This is not an authentication bypass: preview has no database client, no private data and no saved documents. Adding configuration switches the root to authenticated mode. Partially configured credentials should be treated as a configuration error (see config validation).

## Implemented data model

- profiles: owner is auth.users.id; private preferences.
- projects: owner, title, bibliography style, timestamps, deletion tombstone.
- sections: project-owned editor JSON, title/order, parent, revision. Composite parent/project foreign key blocks cross-project hierarchy links.
- sources: server-controlled upload reservation, immutable storage path, status, PDF metadata, deletion tombstone.
- source_pages: project/source composite FK, physical page, extracted text and position mapping.
- notes: project-owned rich content.
- jobs: project-owned status, checkpoint, lease and retries. Browser read-only.

Every application table has ENABLE and FORCE ROW LEVEL SECURITY. Browser grants are explicit. Project owner/tombstone fields and all ingestion fields are not client-updatable. Project/source deletion has no direct browser grant; later workers will coordinate storage cleanup before final row deletion.

private.owns_project is SECURITY INVOKER with a fixed empty search path. It requires both the authenticated owner and an active project. Profiles/sections/notes have owner-limited mutations; source/pages/jobs are read-only for authenticated callers.

Private buckets: sources, assets, exports. A source upload requires a reserved source row owned by the user and the exact storage path. No source overwrite policy. Assets and exports are deny-by-default until dedicated metadata/lifecycle policies exist. No public URLs.

## Planned ingestion (Milestone 3)

Authorize/reserve → signed direct browser upload to Storage → verify stored object size and signature → durable Supabase queue → bounded Vercel Node worker → extract page batches → token chunks with overlap → batched hosted open-weight embeddings → pgvector index → ready.

Use page/extraction checkpoints, stable chunk IDs, idempotent upserts, leases, bounded retries and a scheduled dispatcher. A browser closing or a Vercel invocation timing out must not lose a job. Jobs check deletion generation/state before committing, preventing source resurrection. Storage and database updates are not one distributed transaction.

Plan 25 MB and 300 physical pages initially. Detect corrupt, encrypted, empty, scanned and partially scanned PDFs. Preserve position mappings and distinguish physical page index from printed page label. Multi-page chunk evidence must map to exact supporting pages. Progress reports actual stages/counts, not invented percentages.

Version embedding model ID, dimensions and preprocessing. Index one profile at a time; model changes require re-embedding and a deliberate index switch. Planned dimensions: 1024. Add the vector extension, HNSW index and authenticated SQL retrieval function with Milestone 3.

## Planned assistant (Milestones 4–5)

A server-side adapter handles separate OpenAI-compatible chat and embedding providers. Initial candidates are qwen/qwen3.5-35b-a3b and qwen/qwen3-embedding-8b through OpenRouter. Environment variables allow changes; no proprietary fallback. Candidate quality is unverified until evaluated on app-specific evidence and abstention cases.

Research path: authorize project → persist/rate-limit request → embed query → SQL retrieval under owner/project filters → prompt with untrusted evidence → generate → validate source markers and passage offsets → stream segments → persist canonical citations.

Document text and user draft context cannot issue instructions or tool actions. Model output is never trusted as a file/page locator. Provenance validation cannot prove semantic entailment; evaluations cover relevance, unsupported synthesis, abstention and document prompt injection.

Writing review path: explicitly selected draft text → feedback or proposed diff → user acceptance. Draft is context, not evidence. RRL review covers structure, synthesis and clarity; source checking requires uploaded papers. No unsupported claim of a field-wide research gap.

## Planned editor and deletion

Tiptap core with custom citation, footnote, slash and suggestion extensions. Debounced autosave uses revision checks; show Saved only after acknowledgment. Proposals retain their original target revision and cannot silently overwrite newer edits. Canonical editor JSON feeds bibliography and DOCX/PDF serializers.

Bibliographic metadata is user-confirmed; unknown authors/dates are never invented. Source deletion tombstones access, cancels jobs, removes stored objects/vectors and scrubs citation references in editor/chat/notes. Retain student prose with an explicit removed-citation marker.

## Verification boundaries

PGlite executes these exact SQL migrations against real PostgreSQL RLS, with test-only Supabase auth/storage stubs. This verifies policy predicates, grants and relational integrity. It does not verify GoTrue, email, signed URLs, Storage HTTP, Realtime or hosted pgvector behavior. Those require a connected Supabase environment.

Browser tests run the explicitly labeled preview. Hosted auth acceptance and upload-to-citation E2E remain release gates for later milestones.
