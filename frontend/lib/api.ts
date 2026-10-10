export type Citation = { filename: string; page: number; evidence_id?: string; file_id?: string; locator_type?: "page" | "paragraph" | "line" };
export type Project = { id: string; name: string; created_at: string };
export type SourceFile = {
  id: string;
  filename: string;
  content_type: string;
  status: string;
  warning: string | null;
  created_at: string;
};
export type Note = {
  id: string;
  title: string;
  content: string;
  citations_json: string | null;
  created_at: string;
};
export type Message = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  saved?: boolean;
};
export type StreamEvent = {
  type: "token" | "done" | "error" | "status";
  text?: string;
  answer?: string;
  citations?: Citation[];
  conversation_id?: string;
  message?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("thesis_assistant_token");
}

export function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = authHeaders();
  new Headers(auth).forEach((value, key) => headers.set(key, value));
  if (!(init.body instanceof FormData) && init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    if (response.status === 401) window.localStorage.removeItem("thesis_assistant_token");
    throw new Error(typeof detail.detail === "string" ? detail.detail : `Request failed (${response.status}). Check the entered values.`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function readStream(response: Response, onToken: (text: string) => void): Promise<StreamEvent> {
  if (!response.ok || !response.body) {
    const detail = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(typeof detail.detail === "string" ? detail.detail : "Request failed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: StreamEvent | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const block of events) {
        const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!data) continue;
        const event = JSON.parse(data) as StreamEvent;
        if (event.type === "token") onToken(event.text ?? "");
        else if (event.type === "error") throw new Error(event.message ?? "Model error");
        else if (event.type === "done") completed = event;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (!completed) throw new Error("The response ended without a final answer. Please retry.");
  return completed;
}

export async function streamChat(projectId: string, payload: { question: string; conversation_id?: string }, onToken: (text: string) => void, signal?: AbortSignal): Promise<StreamEvent> {
  return readStream(await fetch(`${API_BASE}/api/v1/projects/${projectId}/chat`, {
    method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload), signal,
  }), onToken);
}

export async function streamSummary(projectId: string, fileId: string, onToken: (text: string) => void, signal?: AbortSignal): Promise<StreamEvent> {
  return readStream(await fetch(`${API_BASE}/api/v1/projects/${projectId}/files/${fileId}/summary`, {
    method: "POST", headers: { ...authHeaders(), Accept: "text/event-stream" }, signal,
  }), onToken);
}

export function locatorLabel(citation: Citation): string {
  return `${citation.locator_type && citation.locator_type !== "page" ? citation.locator_type : "p."} ${citation.page}`;
}

export async function sourceBlob(projectId: string, fileId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/v1/projects/${projectId}/files/${fileId}/content`, { headers: authHeaders() });
  if (!response.ok) throw new Error("This source is unavailable or has been deleted.");
  return response.blob();
}
