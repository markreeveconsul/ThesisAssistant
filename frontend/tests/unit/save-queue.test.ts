import { describe, it, expect, vi } from "vitest";
import { SaveQueue } from "../../lib/save-queue";
import type { Section } from "../../lib/workspace";
import type { SaveResult } from "../../lib/local-workspace";
const section: Section = {
  id: "one",
  project_id: "project",
  title: "Chapter",
  position: 0,
  parent_id: null,
  revision: 0,
  content: { type: "doc", content: [] },
};
describe("serialized autosave", () => {
  it("does not report saved before acknowledgment and saves edits made during a request", async () => {
    let release!: (value: SaveResult) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockImplementation(async (next: Section) => ({
        section: { ...next, revision: next.revision + 1 },
      }));
    const status = vi.fn(),
      committed = vi.fn(),
      queue = new SaveQueue(0, persist, status, committed);
    queue.enqueue(section);
    const saving = queue.flush();
    expect(status).toHaveBeenLastCalledWith("saving");
    queue.enqueue({ ...section, title: "Latest words" });
    release({ section: { ...section, revision: 1 } });
    expect(await saving).toBe(true);
    expect(persist.mock.calls[1][0]).toMatchObject({
      title: "Latest words",
      revision: 1,
    });
    expect(queue.version).toBe(2);
    expect(queue.dirty).toBe(false);
    expect(status).toHaveBeenLastCalledWith("saved");
  });
  it("retains the latest unsaved text after failure and retries with the correct revision", async () => {
    const persist = vi
      .fn()
      .mockResolvedValueOnce({ error: "offline" })
      .mockImplementation(async (next: Section) => ({
        section: { ...next, revision: 5 },
      }));
    const status = vi.fn(),
      queue = new SaveQueue(4, persist, status, vi.fn());
    queue.enqueue(section);
    expect(await queue.flush()).toBe(false);
    expect(queue.dirty).toBe(true);
    queue.enqueue({ ...section, title: "Do not lose me" });
    expect(await queue.flush()).toBe(false);
    expect(await queue.retry()).toBe(true);
    expect(persist.mock.calls[1][0]).toMatchObject({
      title: "Do not lose me",
      revision: 4,
    });
  });
  it("halts on a conflict instead of overwriting another revision", async () => {
    const persist = vi
        .fn()
        .mockResolvedValue({ conflict: true, error: "changed elsewhere" }),
      state = vi.fn();
    const queue = new SaveQueue(1, persist, state, vi.fn());
    queue.enqueue(section);
    await queue.flush();
    await queue.flush();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith("conflict", "changed elsewhere");
    expect(queue.dirty).toBe(true);
  });
});
