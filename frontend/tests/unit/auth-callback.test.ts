import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { GET } from "../../app/auth/callback/route";

describe("OAuth callback", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3002");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.createServerClient.mockImplementation(
      (_url, _key, { cookies }) => ({
        auth: {
          exchangeCodeForSession: async () => {
            cookies.setAll([
              {
                name: "sb-example-auth-token",
                value: "session-cookie",
                options: { httpOnly: true, path: "/" },
              },
            ]);
            return {
              data: { session: { access_token: "test-token" } },
              error: null,
            };
          },
        },
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("keeps session cookies on the post-login redirect", async () => {
    const response = await GET(
      new NextRequest("http://127.0.0.1:3002/auth/callback?code=valid-code"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:3002/");
    expect(response.headers.get("set-cookie")).toContain(
      "sb-example-auth-token=session-cookie",
    );
  });
});
