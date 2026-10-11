# Database policy tests

The executable policy suite is frontend/tests/unit/rls.test.ts. Run npm test from frontend.

It loads the production migration files into PGlite, switches PostgreSQL roles and auth.uid identities, and asserts access outcomes. Supabase-managed auth/storage table plumbing is substituted only for this test harness.

After account setup, repeat two-user tests through Supabase Auth and Storage HTTP. Signed URLs, email and Realtime are not covered by this harness.
