import type { Section } from "./workspace";
import type { SaveResult } from "./local-workspace";
export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";
export class SaveQueue {
  private pending: Section | null = null;
  private running: Promise<boolean> | null = null;
  private blocked = false;
  private revision: number;
  constructor(
    revision: number,
    private persist: (section: Section) => Promise<SaveResult>,
    private state: (state: SaveState, message?: string) => void,
    private committed: (section: Section) => void,
  ) {
    this.revision = revision;
  }
  enqueue(section: Section) {
    this.pending = structuredClone(section);
    if (!this.blocked) this.state("dirty");
  }
  get dirty() {
    return !!this.pending || !!this.running;
  }
  get version() {
    return this.revision;
  }
  async flush(): Promise<boolean> {
    if (this.running) return this.running;
    if (this.blocked) return false;
    if (!this.pending) return true;
    this.running = this.run();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }
  retry() {
    this.blocked = false;
    return this.flush();
  }
  private async run(): Promise<boolean> {
    while (this.pending) {
      const snapshot = this.pending;
      this.pending = null;
      this.state("saving");
      let result: SaveResult;
      try {
        result = await this.persist({ ...snapshot, revision: this.revision });
      } catch {
        result = {
          error:
            "Your draft could not be saved. Check your connection or browser storage, then retry.",
        };
      }
      if (!result.section) {
        this.pending = this.pending ?? snapshot;
        this.blocked = true;
        this.state(
          result.conflict ? "conflict" : "error",
          result.error ?? "Could not save.",
        );
        return false;
      }
      this.revision = result.section.revision;
      this.committed(result.section);
    }
    this.state("saved");
    return true;
  }
}
