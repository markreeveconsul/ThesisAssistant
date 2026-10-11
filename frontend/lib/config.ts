type PublicEnvironment = { url?: string; key?: string };
export function readSupabaseConfig({ url, key }: PublicEnvironment) {
  if (!url && !key) return null;
  if (!url || !key)
    throw new Error(
      "Supabase configuration is incomplete. Set both public URL and publishable key.",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Supabase URL is invalid.");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Supabase URL must use HTTP or HTTPS.");
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A secret key must never be used as a public Supabase key.",
    );
  return { url: parsed.origin, key };
}
export function getSupabaseConfig() {
  return readSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function requireBrowserDraftMode() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_BROWSER_DRAFTS !== "true"
  ) {
    throw new Error(
      "Configure Supabase before deploying. Browser drafts require explicit ALLOW_BROWSER_DRAFTS=true in a demonstration environment.",
    );
  }
}
