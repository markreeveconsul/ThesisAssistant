import { describe, expect, it } from "vitest";
import {
  credentialsSchema,
  projectSchema,
  safeNextPath,
} from "../../lib/validation";
describe("input boundaries", () => {
  it("rejects empty/oversized project titles and unsupported citation styles", () => {
    expect(projectSchema.safeParse({ title: "  " }).success).toBe(false);
    expect(projectSchema.safeParse({ title: "x".repeat(161) }).success).toBe(
      false,
    );
    expect(
      projectSchema.safeParse({ title: "Research", citation_style: "fake" })
        .success,
    ).toBe(false);
    expect(projectSchema.parse({ title: "  Research  " })).toEqual({
      title: "Research",
      citation_style: "apa",
      research_problem: "",
      structure: "five-chapter",
    });
  });
  it("requires a valid email and long signup password", () => {
    expect(
      credentialsSchema.safeParse({
        email: "bad",
        password: "long-enough-password",
      }).success,
    ).toBe(false);
    expect(
      credentialsSchema.safeParse({ email: "a@example.org", password: "short" })
        .success,
    ).toBe(false);
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth/update-password?next=https://evil.example",
    null,
  ])("does not redirect to unapproved destinations: %s", (path) => {
    expect(safeNextPath(path)).toBe("/");
  });
  it("permits password recovery destination", () =>
    expect(safeNextPath("/auth/update-password")).toBe(
      "/auth/update-password",
    ));
});
