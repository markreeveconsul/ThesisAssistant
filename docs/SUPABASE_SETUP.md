# Supabase setup for Thesa

Thesa has Supabase Auth routes, project/chapter persistence, SQL migrations, and row-level security tests. Signed-in projects can store source files in a private Supabase bucket. Browser draft mode continues to use IndexedDB. Both modes use the local FastAPI parser for document extraction.

## 1. Create or choose a Supabase project

Sign in at [Supabase](https://supabase.com/dashboard). Create a project named `Thesa` in your organization, or choose an existing project you intend to use for development. Choose a region close to the people who will use it; Southeast Asia (Singapore) is available. Review the selected plan and any billing details before creating the project.

Set a strong, unique database password and keep it in your password manager. The CLI may ask for it when linking the project. Do not put it in this repository or send it in chat.

## 2. Copy the app configuration locally

In the Supabase dashboard, open **Connect** and copy the project URL and **publishable** key (it starts with `sb_publishable_`). In `frontend/.env.local`, set:

~~~dotenv
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3002
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
~~~

Use `http://localhost:3001` for `NEXT_PUBLIC_SITE_URL` if you start Next.js on port 3001 instead. These are public app settings; do not use a `sb_secret_...` key or a legacy `service_role` key here. Thesa's user routes use the signed-in user's session and RLS, so no elevated key is required.

## 3. Configure Auth redirects

In **Authentication → URL Configuration**, set the Site URL to the value of `NEXT_PUBLIC_SITE_URL`. Add the callback URLs for the local addresses you use:

- `http://127.0.0.1:3002/auth/callback`
- `http://localhost:3002/auth/callback`
- `http://127.0.0.1:3001/auth/callback`
- `http://localhost:3001/auth/callback`

Keep email confirmation enabled. The app's signup flow expects users to confirm their email before signing in. Set the hosted project's minimum password length to 12 or more.

## 4. Enable account creation and Google sign-in

In **Authentication → Settings**, allow new users to sign up. Keep email confirmations enabled for email/password accounts. Users who choose Google can create their Thesa account on their first successful Google sign-in.

Google sign-in needs an OAuth client in Google Cloud and credentials configured in Supabase:

1. In Google Cloud Console, configure the Google Auth Platform consent screen and create an OAuth client ID with application type **Web application**.
2. Add the local Thesa origin as an authorized JavaScript origin: `http://127.0.0.1:3002`. Add `http://localhost:3002` too only if you also use that address.
3. In Supabase **Authentication → Sign In / Providers → Google**, copy the displayed callback URL. Add that exact URL as an **Authorized redirect URI** on the Google OAuth client. It normally looks like `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. This is Google's callback to Supabase; it is different from Thesa's `/auth/callback` URL.
4. Copy the Google client ID and client secret into the Supabase Google provider settings, enable the provider, and save. Do not put Google's client secret in the frontend `.env.local` or commit it.

The app's callback URL still needs to be allowed in Supabase **Authentication → URL Configuration** (see the previous section). Restart Thesa after setup and test the **Continue with Google** button. While the Google consent screen is in testing mode, add each tester's Google account to its test-user list.

## 5. Apply the checked-in migrations

From the repository root in PowerShell, sign the CLI into your Supabase account, link this checkout to the project's reference ID, and apply the migrations:

~~~powershell
.\frontend\node_modules\.bin\supabase.cmd login
.\frontend\node_modules\.bin\supabase.cmd link --project-ref YOUR_PROJECT_REF
.\frontend\node_modules\.bin\supabase.cmd db push
~~~

Find the project reference ID in the dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`. The CLI login opens a browser. Linking may prompt for the database password; enter it in the terminal prompt, not in chat. Review the migration list before accepting the push. The migrations create the profile/project/chapter/source metadata tables, private storage buckets, owner-scoped RLS policies, atomic editor functions, and cloud source ingestion functions. The latest migration, `202610190001_cloud_sources.sql`, enables PDF, DOCX and TXT uploads for signed-in projects. Apply it before using cloud imports.

The CLI is pinned as a development dependency in `frontend/package.json`; after cloning, install dependencies with `cd frontend` then `npm ci`, and return to the repository root to run the commands above. The `supabase/.temp/` CLI state is ignored by Git.

## 6. Verify the connection

Restart Next.js after changing `.env.local`. Open Thesa, create an account, confirm the email, sign in, create a project and a chapter, then reload and confirm they remain. Run `npm test` from `frontend` to exercise the checked-in schema and RLS policies in PGlite.

Existing browser drafts are not imported into the cloud automatically. To use cloud imports, restart Thesa with the local FastAPI parser running, sign in, open a project's Sources page, and upload a PDF, DOCX or TXT file. The original file is stored in the private `sources` bucket; extracted page/paragraph/line text is stored in the owner-protected `sources` and `source_pages` tables. Uploads remain limited to 25 MB per file and 300 PDF pages. Scanned PDFs are detected and warned about; OCR is not included. Embeddings and AI retrieval are separate from source import.
