import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/browser", () => ({ createClient: mocks.createClient }));

import { uploadSource, watchSources } from "../../lib/sources";

describe("cloud source upload", () => {
  const sourceId = "f1c455cb-5e94-4bc8-9ac6-ead27a198f27";
  const storagePath = `owner/project/${sourceId}/notes.txt`;
  let supabase: {
    from: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
    storage: { from: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockResolvedValue({ data: [], error: null });
    const bucket = { upload: vi.fn().mockResolvedValue({ error: null }) };
    supabase = {
      from: vi.fn().mockReturnValue(query),
      rpc: vi.fn(async (name: string) =>
        name === "reserve_source"
          ? {
              data: [{ source_id: sourceId, storage_path: storagePath }],
              error: null,
            }
          : { data: null, error: null },
      ),
      storage: { from: vi.fn().mockReturnValue(bucket) },
    };
    mocks.createClient.mockReturnValue(supabase);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("BroadcastChannel", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const file = new Blob(["A line of evidence."], { type: "text/plain" });
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        return new Response(
          JSON.stringify({
            filename: "notes.txt",
            sha256,
            format: "txt",
            pages: [{ page_number: 1, text: "A line of evidence.", locator_type: "line" }],
            warning: null,
          }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses locally, reserves an owned path, uploads privately, then saves locations", async () => {
    const file = Object.assign(
      new Blob(["A line of evidence."], { type: "text/plain" }),
      { name: "notes.txt" },
    ) as File;
    const source = await uploadSource(
      "project",
      file,
      new AbortController().signal,
      vi.fn(),
      false,
    );

    expect(source).toMatchObject({
      id: sourceId,
      projectId: "project",
      filename: "notes.txt",
      format: "txt",
      count: 1,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, "reserve_source", {
      p_project_id: "project",
      p_filename: "notes.txt",
      p_byte_size: file.size,
      p_sha256: source.sha256,
      p_format: "txt",
    });
    expect(supabase.storage.from).toHaveBeenCalledWith("sources");
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, "complete_source", {
      p_source_id: sourceId,
      p_pages: [
        { page_number: 1, text: "A line of evidence.", locator_type: "line" },
      ],
      p_warning: null,
    });
  });

  it("keeps a cloud workspace usable when realtime setup fails", () => {
    const removeChannel = vi.fn().mockResolvedValue("ok");
    const realtimeChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => {
        throw new Error("Realtime is unavailable");
      }),
    };
    mocks.createClient.mockReturnValue({
      channel: vi.fn(() => realtimeChannel),
      removeChannel,
    });

    let stop: (() => void) | undefined;
    expect(() => {
      stop = watchSources(vi.fn(), false, "project");
    }).not.toThrow();
    expect(stop).toBeTypeOf("function");
    expect(() => stop?.()).not.toThrow();
    expect(removeChannel).toHaveBeenCalledWith(realtimeChannel);
  });

  it("keeps a workspace usable when browser messaging is unavailable", () => {
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        constructor() {
          throw new Error("BroadcastChannel is blocked");
        }
      },
    );

    let stop: (() => void) | undefined;
    expect(() => {
      stop = watchSources(vi.fn());
    }).not.toThrow();
    expect(stop).toBeTypeOf("function");
    expect(() => stop?.()).not.toThrow();
  });
});
