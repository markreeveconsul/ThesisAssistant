import { z } from "zod";
import { createClient as createSupabaseClient } from "@/lib/supabase/browser";

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
export type SourceContent = SourceInfo & { pages: SourcePage[] };
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

type CloudSourceRow = {
  id: string;
  project_id: string;
  filename: string;
  storage_path: string;
  byte_size: number;
  sha256: string | null;
  format: SourceInfo["format"];
  warning: string | null;
  page_count: number | null;
  created_at: string;
};

function sourceInfo(row: CloudSourceRow): SourceInfo {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    sha256: row.sha256 ?? "",
    format: row.format,
    size: Number(row.byte_size),
    count: Number(row.page_count ?? 0),
    warning: row.warning,
    createdAt: row.created_at,
  };
}

export async function listSources(
  projectId: string,
  local = true,
): Promise<SourceInfo[]> {
  if (!local) {
    const { data, error } = await createSupabaseClient()
      .from("sources")
      .select(
        "id,project_id,filename,storage_path,byte_size,sha256,format,warning,page_count,created_at",
      )
      .eq("project_id", projectId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load this project's cloud sources.");
    return (data as CloudSourceRow[]).map(sourceInfo);
  }
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
  local = true,
): Promise<StoredSource | null> {
  if (!local) return getCloudSource(projectId, id);
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

async function getCloudSource(
  projectId: string,
  id: string,
): Promise<StoredSource | null> {
  const supabase = createSupabaseClient();
  const { data: row, error: sourceError } = await supabase
    .from("sources")
    .select(
      "id,project_id,filename,storage_path,byte_size,sha256,format,warning,page_count,created_at,status",
    )
    .eq("id", id)
    .eq("project_id", projectId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .maybeSingle();
  if (sourceError) throw new Error("Could not load the cloud source.");
  if (!row) return null;
  const source = row as CloudSourceRow & { status: string };
  const [stored, extracted] = await Promise.all([
    supabase.storage.from("sources").download(source.storage_path),
    supabase
      .from("source_pages")
      .select("page_number,text,locator_type")
      .eq("project_id", projectId)
      .eq("source_id", id)
      .order("page_number"),
  ]);
  if (stored.error || !stored.data || extracted.error || !extracted.data)
    throw new Error("Could not download this source from private storage.");
  const parsedPages = z.array(sourcePageSchema).safeParse(extracted.data);
  if (!parsedPages.success)
    throw new Error("This source has invalid extracted text. Re-upload it.");
  const mimeType =
    source.format === "pdf"
      ? "application/pdf"
      : source.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";
  return {
    ...sourceInfo(source),
    blob: new Blob([stored.data], { type: mimeType }),
    pages: parsedPages.data,
  };
}

export async function getSourceContent(
  projectId: string,
  id: string,
  local = true,
): Promise<SourceContent | null> {
  if (local) {
    const source = await getSource(projectId, id);
    if (!source) return null;
    const { blob: _blob, ...content } = source;
    return content;
  }
  const supabase = createSupabaseClient();
  const { data: row, error: sourceError } = await supabase
    .from("sources")
    .select(
      "id,project_id,filename,storage_path,byte_size,sha256,format,warning,page_count,created_at",
    )
    .eq("id", id)
    .eq("project_id", projectId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .maybeSingle();
  if (sourceError) throw new Error("Could not load this project's source text.");
  if (!row) return null;
  const source = row as CloudSourceRow;
  const { data: extracted, error } = await supabase
    .from("source_pages")
    .select("page_number,text,locator_type")
    .eq("project_id", projectId)
    .eq("source_id", id)
    .order("page_number");
  if (error || !extracted)
    throw new Error("Could not load extracted text for this source.");
  const pages = z.array(sourcePageSchema).safeParse(extracted);
  if (!pages.success)
    throw new Error("This source has invalid extracted text. Re-upload it.");
  return { ...sourceInfo(source), pages: pages.data };
}

function notifySources() {
  window.dispatchEvent(new Event("thesa-sources-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(DB_NAME);
    channel.postMessage("changed");
    channel.close();
  }
}

export function watchSources(
  refresh: () => void,
  local = true,
  projectId?: string,
) {
  window.addEventListener("thesa-sources-changed", refresh);
  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(DB_NAME);
      channel.onmessage = refresh;
    }
  } catch {
    // Browser messaging is only an optimization; the workspace still loads without it.
  }

  let supabase: ReturnType<typeof createSupabaseClient> | null = null;
  let realtime: import("@supabase/supabase-js").RealtimeChannel | null = null;
  try {
    if (!local && projectId) {
      supabase = createSupabaseClient();
      realtime = supabase.channel(`source-library-${projectId}`);
      realtime
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "sources",
            filter: `project_id=eq.${projectId}`,
          },
          refresh,
        )
        .subscribe();
    }
  } catch {
    // Realtime refresh is best-effort; it must not prevent opening the project.
  }
  return () => {
    window.removeEventListener("thesa-sources-changed", refresh);
    try {
      channel?.close();
    } catch {
      // Ignore teardown failures from an unavailable browser channel.
    }
    if (supabase && realtime) {
      void supabase.removeChannel(realtime).catch(() => undefined);
    }
  };
}

export async function deleteSource(
  projectId: string,
  id: string,
  local = true,
) {
  if (!local) {
    const supabase = createSupabaseClient();
    const { data: row, error: lookupError } = await supabase
      .from("sources")
      .select("storage_path")
      .eq("id", id)
      .eq("project_id", projectId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .maybeSingle();
    if (lookupError || !row) throw new Error("This source is no longer available.");
    const { error: storageError } = await supabase.storage
      .from("sources")
      .remove([row.storage_path]);
    if (storageError) throw new Error("Could not remove the source file from storage.");
    const { error } = await supabase.rpc("delete_source", { p_source_id: id });
    if (error)
      throw new Error("The source file was removed, but its record could not be deleted. Retry deletion.");
    notifySources();
    return;
  }
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
  local = true,
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
  if ((await listSources(projectId, local)).some((source) => source.sha256 === sha256))
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
  onStage(local ? "Saving to this browser…" : "Saving to your cloud library…");
  const { filename, format, pages, warning } = parsed.data;
  if (!local) {
    return uploadCloudSource(
      projectId,
      file,
      parsed.data,
      signal,
      onStage,
    );
  }
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

async function uploadCloudSource(
  projectId: string,
  file: File,
  parsed: z.infer<typeof parsedSchema>,
  signal: AbortSignal,
  onStage: (stage: string) => void,
): Promise<SourceInfo> {
  const supabase = createSupabaseClient();
  const { data, error: reserveError } = await supabase.rpc("reserve_source", {
    p_project_id: projectId,
    p_filename: parsed.filename,
    p_byte_size: file.size,
    p_sha256: parsed.sha256,
    p_format: parsed.format,
  });
  if (reserveError) {
    if (reserveError.message.includes("Could not find the function"))
      throw new Error("Cloud source storage is not set up yet. Apply the latest Thesa database migration, then retry.");
    if (reserveError.message.toLowerCase().includes("already in this project"))
      throw new Error("This file is already in this project's source library.");
    throw new Error("Could not reserve cloud storage for this file. Check your connection and retry.");
  }
  const reservation = Array.isArray(data) ? data[0] : data;
  if (!reservation?.source_id || !reservation?.storage_path)
    throw new Error("Cloud storage returned an invalid upload reservation.");
  signal.throwIfAborted();

  let uploaded = false;
  try {
    onStage("Uploading to private cloud storage…");
    const contentType =
      parsed.format === "pdf"
        ? "application/pdf"
        : parsed.format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain";
    const { error: uploadError } = await supabase.storage
      .from("sources")
      .upload(reservation.storage_path, file, { contentType, upsert: false });
    if (uploadError) throw new Error("Supabase could not store this file. Verify the source bucket migration and retry.");
    uploaded = true;
    signal.throwIfAborted();
    onStage("Saving extracted locations…");
    const { error: completeError } = await supabase.rpc("complete_source", {
      p_source_id: reservation.source_id,
      p_pages: parsed.pages,
      p_warning: parsed.warning,
    });
    if (completeError) throw new Error("The file uploaded, but its extracted text could not be saved.");
  } catch (error) {
    const cleanup = uploaded
      ? await supabase.storage.from("sources").remove([reservation.storage_path])
      : { error: null };
    if (!cleanup.error) {
      await supabase.rpc("cancel_source", {
        p_source_id: reservation.source_id,
      });
    }
    if (signal.aborted) throw new Error("Upload canceled. No source was saved.");
    throw error instanceof Error ? error : new Error("Cloud upload failed.");
  }

  const info: SourceInfo = {
    id: reservation.source_id,
    projectId,
    filename: parsed.filename,
    sha256: parsed.sha256,
    format: parsed.format,
    size: file.size,
    count: parsed.pages.length,
    warning: parsed.warning,
    createdAt: new Date().toISOString(),
  };
  notifySources();
  return info;
}

export function locatorLabel(format: SourceInfo["format"], plural = false) {
  const label =
    format === "pdf" ? "Page" : format === "docx" ? "Paragraph" : "Line";
  return label + (plural ? "s" : "");
}
