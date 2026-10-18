"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, PanelRight, X } from "lucide-react";
import { askSources, type ChatTurn, type Citation } from "@/lib/chat";
import { watchSources } from "@/lib/sources";

type OttoMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
};

export function AssistantPanel({
  open,
  docked,
  onOpenChange,
  onDockChange,
  onSources,
  onUnavailable,
  projectId,
  local,
  onCitation,
}: {
  open: boolean;
  docked: boolean;
  onOpenChange: (open: boolean) => void;
  onDockChange: (docked: boolean) => void;
  onSources: () => void;
  onUnavailable: (feature: string) => void;
  projectId: string;
  local: boolean;
  onCitation: (citation: Citation) => void;
}) {
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<OttoMessage[]>([]);
  const controller = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, status, error]);
  useEffect(() => {
    setMessages([]);
    setConsent(false);
    setQuestion("");
    const stop = watchSources(() => {
      controller.current?.abort();
      setMessages([]);
      setStatus("Sources changed. Ask again to use the current library.");
    });
    return () => {
      stop();
      controller.current?.abort();
    };
  }, [projectId]);
  async function send() {
    if (busy || !consent || !local || question.trim().length < 3) return;
    const abort = new AbortController();
    controller.current = abort;
    const currentQuestion = question.trim();
    const history: ChatTurn[] = messages
      .filter((message) => message.content.trim())
      .map(({ role, content }) => ({ role, content }));
    const userMessage: OttoMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: currentQuestion,
      citations: [],
    };
    const responseId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      userMessage,
      { id: responseId, role: "assistant", content: "", citations: [] },
    ]);
    setQuestion("");
    setBusy(true);
    setError("");
    setStatus("Reading this project's sources…");
    try {
      await askSources(projectId, currentQuestion, history, abort.signal, (event) => {
        if (abort.signal.aborted) return;
        if (event.type === "status") setStatus(event.message);
        if (event.type === "answer" || event.type === "abstention")
          setMessages((current) =>
            current.map((message) =>
              message.id === responseId
                ? { ...message, content: event.message }
                : message,
            ),
          );
        if (event.type === "citation")
          setMessages((current) =>
            current.map((message) =>
              message.id === responseId
                ? { ...message, citations: [...message.citations, event.citation] }
                : message,
            ),
          );
        if (event.type === "done") setStatus("Response complete.");
      });
    } catch (e) {
      setMessages((current) => current.filter((message) => message.id !== responseId));
      setStatus("");
      setError(
        abort.signal.aborted
          ? "Question canceled. No answer was saved."
          : e instanceof Error
            ? e.message
            : "Otto could not answer. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) close.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open, onOpenChange]);
  return (
    <>
      <button
        ref={trigger}
        className="otto-trigger"
        aria-label="Open Otto assistant"
        aria-expanded={open}
        aria-controls="otto-panel"
        hidden={open}
        onClick={() => onOpenChange(true)}
        title="Open Otto (Ctrl/⌘ K)"
      >
        <Image src="/otto/otto-head-512.png" width={132} height={132} alt="" />
      </button>
      {open && (
        <section
          id="otto-panel"
          className={"otto-panel" + (docked ? " docked" : "")}
          role="dialog"
          aria-label="Otto assistant"
        >
          <div className="otto-heading">
            <Image
              src="/otto/otto-head-512.png"
              width={40}
              height={40}
              alt=""
            />
            <div>
              <strong>Otto</strong>
              <span className="otto-status">Grounded source chat · preview</span>
            </div>
            <button
              className="quiet-button"
              aria-pressed={docked}
              onClick={() => onDockChange(!docked)}
            >
              <PanelRight size={15} />
              {docked ? "Float" : "Dock"}
            </button>
            <button
              ref={close}
              className="icon-button"
              aria-label="Close Otto"
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </button>
          </div>
          <div
            className="otto-log"
            ref={log}
            tabIndex={0}
            role="region"
            aria-label="Otto conversation"
          >
            {!messages.length && (
              <>
                <p className="otto-message">
                  Ask naturally about your uploaded sources. I’ll explain what
                  they say, show the supporting passage, and point you to its
                  file and page. Follow-up questions work too.
                </p>
                <div className="otto-availability">
                  <strong>Grounded answers, with source locations.</strong>
                  <p>
                    Ask in your own words about methods, findings,
                    limitations, or evidence you might use. Otto explains the
                    source and shows the original passage. Check each quotation
                    in its original file.
                  </p>
                  <button className="text-button" onClick={onSources}>
                    View source library →
                  </button>
                </div>
              </>
            )}
            {!local && (
              <p>
                Source chat is currently available only for local browser
                drafts.
              </p>
            )}
            {messages.map((message) =>
              message.role === "user" ? (
                <p className="otto-user-message" key={message.id}>
                  {message.content}
                </p>
              ) : (
                <article
                  className="otto-answer"
                  aria-label="Otto answer"
                  key={message.id}
                >
                  {message.content && <p>{message.content}</p>}
                  {message.citations.map((citation, index) => (
                    <div key={`${citation.source_id}-${citation.location}-${index}`}>
                      <blockquote>{citation.text}</blockquote>
                      <button
                        className="text-button"
                        onClick={() => onCitation(citation)}
                      >
                        {citation.filename} · {citation.locator_type}{" "}
                        {citation.location}
                      </button>
                    </div>
                  ))}
                </article>
              ),
            )}
            <p role="status" aria-live="polite">
              {status}
            </p>
            {error && (
              <p role="alert" className="otto-error">
                {error}
              </p>
            )}
          </div>
          <footer className="otto-footer">
            <div className="otto-prompts">
              {["Summarize", "Review RRL"].map((label) => (
                <button key={label} onClick={() => onUnavailable(label)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="otto-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy || !local}
                onChange={(event) => setConsent(event.target.checked)}
              />
              Send extracted source chunks and my question to Google Gemini
              embeddings for search; send my question, recent chat context, and
              the matching excerpts to Gemini chat. Files stay in this browser;
              extracted text is processed by local FastAPI first. Google may
              use free-tier prompts to improve its products. Avoid sensitive
              thesis material.
            </label>
            <form
              className="otto-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <input
                aria-label="Ask Otto"
                placeholder="Ask about your sources…"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={2000}
                disabled={busy || !local || !consent}
              />
              <button
                type="submit"
                disabled={
                  busy || !local || !consent || question.trim().length < 3
                }
                aria-label="Send question"
              >
                <ArrowUp size={18} />
              </button>
            </form>
            {busy && (
              <button
                className="text-button"
                onClick={() => controller.current?.abort()}
              >
                Cancel question
              </button>
            )}
            <p>
              Chat stays in memory and clears when sources change. Your draft is
              never edited.
            </p>
          </footer>
        </section>
      )}
    </>
  );
}
