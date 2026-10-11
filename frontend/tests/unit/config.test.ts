import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "../../lib/config";
describe("configuration boundary", () => {
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
