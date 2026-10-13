import { z } from "zod";

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const sourcePageSchema = z.object({
  page_number: z.number().int().positive(),
  text: z.string(),
  locator_type: z.enum(["page", "paragraph", "line"]),
});
const parsedSchema = z.object({
  filename: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  format: z.enum(["pdf", "docx", "txt"]),
  pages: z.array(sourcePageSchema).min(1).max(10000),
  warning: z.string().nullable(),
});
export type SourcePage = z.infer<typeof sourcePageSchema>;
export type SourceInfo = {
  id: string;
  projectId: string;
  filename: string;
  sha256: string;
  format: "pdf" | "docx" | "txt";
  size: number;
  count: number;
  warning: string | null;
  createdAt: string;
};
export type StoredSource = SourceInfo & { blob: Blob; pages: SourcePage[] };
const DB_NAME = "thesa-sources-v1";

function storageError(error: DOMException | null) {
  if (error?.name === "QuotaExceededError")
    return new Error(
      "Browser storage is full. Remove an unused source or free space, then retry. This file was not saved.",
    );
  if (error?.name === "ConstraintError")
    return new Error("This file is already in this project's source library.");
  return new Error(
    "Could not access source storage. Allow browser storage and retry.",
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const metadata = request.result.createObjectStore("sources", {
        keyPath: "id",
      });
      metadata.createIndex("project", "projectId");
      metadata.createIndex("projectHash", ["projectId", "sha256"], {
        unique: true,
      });
      request.result.createObjectStore("documents", { keyPath: "id" });
    };
    request.onerror = () => reject(storageError(request.error));
    request.onblocked = () =>
      reject(
        new Error("Close other Thesa tabs and retry opening source storage."),
      );
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(storageError(tx.error));
    };
    tx.onerror = () => {
      /* Aborts report one actionable error via onabort. */
    };
    try {
      run(tx, (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      reject(error instanceof DOMException ? storageError(error) : error);
    }
  });
}

export function listSources(projectId: string): Promise<SourceInfo[]> {
  return transaction(["sources"], "readonly", (tx, done) => {
    const request = tx
      .objectStore("sources")
      .index("project")
      .getAll(projectId);
    request.onsuccess = () =>
      done(
        (request.result as SourceInfo[]).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      );
  });
}

export function getSource(
  projectId: string,
  id: string,
): Promise<StoredSource | null> {
  return transaction(["sources", "documents"], "readonly", (tx, done) => {
    const info = tx.objectStore("sources").get(id);
    info.onsuccess = () => {
      if (!info.result || info.result.projectId !== projectId) {
        done(null);
        return;
      }
      const document = tx.objectStore("documents").get(id);
      document.onsuccess = () =>
        done(
          document.result?.projectId === projectId
            ? { ...info.result, ...document.result }
            : null,
        );
    };
  });
}

function notifySources() {
  window.dispatchEvent(new Event("thesa-sources-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(DB_NAME);
    channel.postMessage("changed");
    channel.close();
  }
}

export function watchSources(refresh: () => void) {
  window.addEventListener("thesa-sources-changed", refresh);
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(DB_NAME)
      : null;
  if (channel) channel.onmessage = refresh;
  return () => {
    window.removeEventListener("thesa-sources-changed", refresh);
    channel?.close();
  };
}

export async function deleteSource(projectId: string, id: string) {
  await transaction<void>(["sources", "documents"], "readwrite", (tx, done) => {
    const store = tx.objectStore("sources"),
      request = store.get(id);
    request.onsuccess = () => {
      if (request.result?.projectId === projectId) {
        store.delete(id);
        tx.objectStore("documents").delete(id);
      }
      done();
    };
  });
  notifySources();
}

export async function uploadSource(
  projectId: string,
  file: File,
  signal: AbortSignal,
  onStage: (stage: string) => void,
): Promise<SourceInfo> {
  if (!/\.(pdf|docx|txt)$/i.test(file.name))
    throw new Error("Choose a PDF, DOCX or UTF-8 TXT file.");
  if (!file.size) throw new Error("The file is empty.");
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error("Maximum file size is 25 MB.");
  onStage("Checking file…");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if ((await listSources(projectId)).some((source) => source.sha256 === sha256))
    throw new Error("This file is already in this project's source library.");
  signal.throwIfAborted();
  const url =
    process.env.NEXT_PUBLIC_DOCUMENT_API_URL || "http://127.0.0.1:8000";
  onStage("Uploading and extracting text…");
  let response: Response;
  try {
    response = await fetch(url.replace(/\/$/, "") + "/parse", {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": encodeURIComponent(file.name),
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
    });
  } catch (error) {
    if (signal.aborted)
      throw new Error("Upload canceled. No source was saved.");
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error("Parsing timed out. Try a smaller document or retry.");
    throw new Error(
      "Cannot reach the document service. Start the FastAPI backend and retry.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof result?.detail === "string"
        ? result.detail
        : "Document processing failed. Please retry.",
    );
  const parsed = parsedSchema.safeParse(result);
  if (!parsed.success || parsed.data.sha256 !== sha256)
    throw new Error(
      "The document service returned an invalid response. No source was saved.",
    );
  signal.throwIfAborted();
  onStage("Saving to this browser…");
  const { filename, format, pages, warning } = parsed.data;
  const info: SourceInfo = {
    id: crypto.randomUUID(),
    projectId,
    filename,
    sha256,
    format,
    size: file.size,
    count: pages.length,
    warning,
    createdAt: new Date().toISOString(),
  };
  await transaction<void>(["sources", "documents"], "readwrite", (tx, done) => {
    tx.objectStore("sources").add(info);
    tx.objectStore("documents").add({
      id: info.id,
      projectId,
      blob: file.slice(
        0,
        file.size,
        format === "pdf" ? "application/pdf" : file.type,
      ),
      pages,
    });
    done();
  });
  notifySources();
  return info;
}

export function locatorLabel(format: SourceInfo["format"], plural = false) {
  const label =
    format === "pdf" ? "Page" : format === "docx" ? "Paragraph" : "Line";
  return label + (plural ? "s" : "");
}
