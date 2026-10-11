import { afterEach, describe, expect, it, vi } from "vitest";
import { readSupabaseConfig, requireBrowserDraftMode } from "../../lib/config";
afterEach(() => vi.unstubAllEnvs());
describe("configuration boundary", () => {
  it("requires explicit browser draft opt-in in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_BROWSER_DRAFTS", "false");
    expect(requireBrowserDraftMode).toThrow(/Configure Supabase/);
    vi.stubEnv("ALLOW_BROWSER_DRAFTS", "true");
    expect(requireBrowserDraftMode).not.toThrow();
  });
  it("only enables preview when both credentials are absent", () =>
    expect(readSupabaseConfig({})).toBeNull());
  it("fails closed for partial configuration", () => {
    expect(() =>
      readSupabaseConfig({ url: "https://example.supabase.co" }),
    ).toThrow(/incomplete/);
    expect(() => readSupabaseConfig({ key: "sb_publishable_test" })).toThrow(
      /incomplete/,
    );
  });
  it("rejects invalid URL and server secret keys", () => {
    expect(() => readSupabaseConfig({ url: "garbage", key: "test" })).toThrow(
      /invalid/,
    );
    expect(() =>
      readSupabaseConfig({ url: "file:///secret", key: "test" }),
    ).toThrow(/HTTP/);
    expect(() =>
      readSupabaseConfig({
        url: "https://example.supabase.co",
        key: "sb_secret_private",
      }),
    ).toThrow(/secret key/);
  });
  it("accepts the configured endpoint and publishable key", () => {
    expect(
      readSupabaseConfig({
        url: "https://example.supabase.co/",
        key: "sb_publishable_test",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      key: "sb_publishable_test",
    });
  });
});
