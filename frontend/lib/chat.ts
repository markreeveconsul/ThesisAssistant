import { z } from "zod";
import {
  getSourceContent,
  listSources,
  type SourceContent,
} from "./sources";

const citationSchema = z.object({
  source_id: z.string(),
  filename: z.string(),
  location: z.number().int().positive(),
  locator_type: z.enum(["page", "paragraph", "line"]),
  text: z.string().min(1).max(4000),
});
export type Citation = z.infer<typeof citationSchema>;
export type ChatTurn = { role: "user" | "assistant"; content: string };

export function chatHttpErrorMessage(detail: unknown): string {
  if (
    detail ===
    "Invalid question or source library. Use this project's sources and at most 2 million characters."
  ) {
    return "The backend is out of date. Stop the old Thesa launcher (press Enter in its window), then run Start Thesa.bat again. If the message returns, another backend is still using port 8000."
  }
  return typeof detail === "string"
    ? detail
    : "Otto could not process this question.";
}

export function recentChatContext(history: ChatTurn[]): ChatTurn[] {
  return history.slice(-4).map(({ role, content }) => ({
    role,
    content: content.slice(0, 2500),
  }));
}

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), message: z.string() }),
  z.object({ type: z.literal("answer"), message: z.string() }),
  z.object({ type: z.literal("citation"), citation: citationSchema }),
  z.object({ type: z.literal("abstention"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type ChatEvent = z.infer<typeof eventSchema>;

export async function askSources(
  projectId: string,
  question: string,
  history: ChatTurn[],
  signal: AbortSignal,
  receive: (event: ChatEvent) => void,
  local = true,
) {
  const metadata = await listSources(projectId, local);
  if (!metadata.length)
    throw new Error(
      local
        ? "No sources are uploaded for this project in this browser. Open the source library and upload a PDF, DOCX or TXT file first."
        : "No sources are uploaded for this project. Open the source library and add a PDF, DOCX or TXT file first.",
    );
  if (metadata.length > 50)
    throw new Error("This version supports up to 50 sources per question.");
  const documents: SourceContent[] = [];
  let characters = 0;
  for (const info of metadata) {
    signal.throwIfAborted();
    const source = await getSourceContent(projectId, info.id, local);
    if (!source)
      throw new Error("The source library changed. Retry your question.");
    characters += source.pages.reduce((sum, page) => sum + page.text.length, 0);
    if (characters > 2_000_000)
      throw new Error(
        "This source library exceeds the 2 million character chat limit.",
      );
    documents.push(source);
  }
  if (!documents.some((source) => source.pages.some((page) => page.text.trim())))
    throw new Error(
      "These files have no searchable text. Check the extraction warning in the source library; scanned PDFs need OCR before Otto can read them.",
    );
  const url =
    process.env.NEXT_PUBLIC_DOCUMENT_API_URL || "http://127.0.0.1:8000";
  let response: Response;
  try {
    response = await fetch(url.replace(/\/$/, "") + "/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      body: JSON.stringify({
        project_id: projectId,
        question,
        history: recentChatContext(history),
        sources: documents.map((source) => ({
          id: source.id,
          project_id: projectId,
          filename: source.filename,
          pages: source.pages,
        })),
      }),
    });
  } catch {
    throw new Error(
      signal.aborted
        ? "Question canceled."
        : "Cannot reach Otto. Check the backend or retry if the request timed out.",
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(chatHttpErrorMessage(error?.detail));
  }
  if (!response.body) throw new Error("Otto returned no response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "",
    done = false;
  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      if (pending.length > 100_000)
        throw new Error("Otto returned an oversized response.");
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        if (!line.trim()) continue;
        const event = eventSchema.parse(JSON.parse(line));
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "citation") {
          const source = documents.find(
            (item) => item.id === event.citation.source_id,
          );
          const page = source?.pages.find(
            (item) =>
              item.page_number === event.citation.location &&
              item.locator_type === event.citation.locator_type,
          );
          if (
            !source ||
            source.filename !== event.citation.filename ||
            !page?.text.includes(event.citation.text)
          )
            throw new Error(
              "Otto returned an invalid citation. No answer was saved.",
            );
        }
        if (event.type === "done") done = true;
        receive(event);
      }
      if (chunk.done) break;
    }
    if (!done) throw new Error("The response was interrupted. Please retry.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
