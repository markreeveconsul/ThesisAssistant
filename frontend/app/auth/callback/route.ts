import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/config";
import { safeNextPath } from "@/lib/validation";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: NextRequest) {
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const appUrl = (path: string) => new URL(path, siteOrigin);
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    console.warn("Supabase auth provider returned an error", {
      providerError: providerError.slice(0, 100),
    });
    return NextResponse.redirect(appUrl("/auth?error=oauth"));
  }

  const code = request.nextUrl.searchParams.get("code");
  const config = getSupabaseConfig();
  if (!code || !config)
    return NextResponse.redirect(appUrl("/auth?error=link"));

  let redirectPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const pendingCookies = new Map<string, PendingCookie>();
  const redirectWithCookies = () => {
    const response = NextResponse.redirect(appUrl(redirectPath));
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    return response;
  };
  let response = redirectWithCookies();
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          pendingCookies.set(name, { name, value, options });
        });
        response = redirectWithCookies();
      },
    },
  });
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    if (error)
      console.error("Supabase auth callback code exchange failed", {
        errorCode: error.code,
        status: error.status,
      });
    else console.error("Supabase auth callback completed without a session");
    redirectPath = "/auth?error=link";
    return redirectWithCookies();
  }
  return response;
}
