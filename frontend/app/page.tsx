"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { apiFetch, getToken, streamChat, streamSummary, locatorLabel } from "@/lib/api";
import type { Citation, Message, Note, Project, SourceFile } from "@/lib/api";

import SourcePreview from "@/components/SourcePreview";


function decodeError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [projectName, setProjectName] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const loadSequence = useRef(0);
  const requestController = useRef<AbortController | null>(null);

  const reloadWorkspace = useCallback(async (selectedProjectId?: string) => {
    const sequence = ++loadSequence.current;
    const list = await apiFetch<Project[]>("/api/v1/projects/");
    if (sequence !== loadSequence.current) return;
    const selected = list.find((item) => item.id === selectedProjectId) ?? list[0] ?? null;
    setProjects(list); setProject(selected); setConversationId(undefined);
    setFiles([]); setNotes([]); setMessages([]); setSelectedCitation(null);
    if (!selected) { setFiles([]); setNotes([]); setMessages([]); return; }
    const [projectFiles, projectNotes, history] = await Promise.all([
      apiFetch<SourceFile[]>(`/api/v1/projects/${selected.id}/files`),
      apiFetch<Note[]>(`/api/v1/projects/${selected.id}/notes`),
      apiFetch<Message[]>(`/api/v1/projects/${selected.id}/history`),
    ]);
    if (sequence !== loadSequence.current) return;
    setFiles(projectFiles); setNotes(projectNotes); setMessages(history);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    void apiFetch<{email: string}>("/api/v1/auth/me").then(async (user) => {
      setEmail(user.email); setAuthenticated(true); await reloadWorkspace();
    }).catch((error: unknown) => { setAuthenticated(false); setNotice(decodeError(error)); });
  }, [reloadWorkspace]);

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setPending(true);
    try {
      if (authMode === "register") {
        await apiFetch("/api/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
    const body = new URLSearchParams({ username: email, password });
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) throw new Error((await response.json()).detail ?? "Authentication failed");
      const result = (await response.json()) as { access_token: string };
      localStorage.setItem("thesis_assistant_token", result.access_token);
      setAuthenticated(true);
      await reloadWorkspace();
    } catch (error) {
      setNotice(decodeError(error));
    } finally { setPending(false); }
  }

  function signOut() {
    requestController.current?.abort();
    loadSequence.current += 1;
    setSelectedCitation(null);
    setConversationId(undefined);
    localStorage.removeItem("thesis_assistant_token");
    setAuthenticated(false);
    setProject(null);
    setProjects([]);
    setFiles([]);
    setNotes([]);
    setMessages([]);
    setNotice("");
  }

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectName.trim() || pending) return;
    try {
      const created = await apiFetch<Project>("/api/v1/projects/", {
        method: "POST",
        body: JSON.stringify({ name: projectName.trim() }),
      });
      setProjectName("");
      setMessages([]);
      setConversationId(undefined);
      await reloadWorkspace(created.id);
    } catch (error) {
      setNotice(decodeError(error));
    }
  }

  async function uploadFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files;
    if (!project || !selected?.length) return;
    setPending(true);
    setNotice("");
    try {
      for (const file of Array.from(selected)) {
        setNotice(`Indexing ${file.name}. This can take a few minutes on a CPU.`);
        const body = new FormData();
        body.append("file", file);
        await apiFetch(`/api/v1/projects/${project.id}/files`, { method: "POST", body });
      }
      setNotice("Upload complete.");
    } catch (error) {
      setNotice(decodeError(error));
    } finally {
      await reloadWorkspace(project.id).catch((error: unknown) => setNotice(decodeError(error)));
      setPending(false);
      event.target.value = "";
    }
  }

  async function removeFile(file: SourceFile) {
    if (!project || !window.confirm(`Delete “${file.filename}” and its indexed chunks?`)) return;
    try {
      await apiFetch(`/api/v1/projects/${project.id}/files/${file.id}`, { method: "DELETE" });
      await reloadWorkspace(project.id);
    } catch (error) {
      setNotice(decodeError(error));
    }
  }

  async function removeProject(item: Project) {
    if (!window.confirm(`Delete “${item.name}”, its files, chat and notes? This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/v1/projects/${item.id}`, { method: "DELETE" });
      setMessages([]);
      setConversationId(undefined);
      setProject(null);
      setFiles([]);
      setNotes([]);
      await reloadWorkspace();
    } catch (error) {
      setNotice(decodeError(error));
    }
  }

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!project || !nextQuestion || pending || !files.some((file) => file.status === "ready")) return;
    setQuestion("");
    setNotice("");
    setPending(true);
    setMessages((items) => [...items, { role: "user", content: nextQuestion }, { role: "assistant", content: "", citations: [] }]);
    requestController.current = new AbortController();
    try {
      const result = await streamChat(
        project.id,
        { question: nextQuestion, ...(conversationId ? { conversation_id: conversationId } : {}) },
        (token) => setMessages((items) => {
          const next = [...items];
          const last = next[next.length - 1];
          if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + token };
          return next;
        }),
        requestController.current.signal,
      );
      setConversationId(result.conversation_id);
      setMessages((items) => {
        const next = [...items];
        next[next.length - 1] = {
          role: "assistant",
          content: result.answer ?? "",
          citations: result.citations ?? [],
        };
        return next;
      });
    } catch (error) {
      setNotice(decodeError(error));
      setMessages((items) => items.slice(0, -2));
      setQuestion(nextQuestion);
    } finally {
      setPending(false);
    }
  }

  async function summarize(file: SourceFile) {
    if (!project || pending) return;
    setPending(true); setNotice("");
    requestController.current = new AbortController();
    setMessages((items) => [...items, { role: "assistant", content: "", citations: [] }]);
    try {
      const result = await streamSummary(project.id, file.id, (text) => {
        setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: item.content + text } : item));
      }, requestController.current.signal);
      setConversationId(undefined);
      setMessages((items) => [...items.slice(0, -1), { role: "assistant", content: result.answer ?? "", citations: result.citations }]);
    } catch (error) {
      setMessages((items) => items.slice(0, -1)); setNotice(decodeError(error));
    } finally { setPending(false); }
  }

  async function saveNote(message: Message) {
    if (!project) return;
    const title = message.content.slice(0, 70).trim() || "Saved answer";
    try {
      const saved = await apiFetch<Note>(`/api/v1/projects/${project.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ title, content: message.content, citations_json: JSON.stringify(message.citations ?? []) }),
      });
      setNotes((items) => [saved, ...items]);
      setMessages((items) => items.map((item) => item === message ? { ...item, saved: true } : item));
      setNotice("Answer saved to project notes.");
    } catch (error) {
      setNotice(decodeError(error));
    }
  }

  if (!authenticated) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-lockup"><span className="brand-mark">T</span><div><strong>Thesis<span>Assistant</span></strong><small>Research, grounded in your sources.</small></div></div>
          <p className="eyebrow">A focused workspace for your research</p>
          <h1>{authMode === "login" ? "Welcome back" : "Create your workspace"}</h1>
          <p className="subtle">Sign in to keep reading, organizing, and asking questions about your work.</p>
          {notice && <p className="notice error">{notice}</p>}
          <form className="stack-form" onSubmit={authenticate}>
            <label>Email address<input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="primary-button wide" type="submit" disabled={pending}>{authMode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <button className="text-button switch-auth" onClick={() => { setNotice(""); setAuthMode(authMode === "login" ? "register" : "login"); }}>
            {authMode === "login" ? "New to ThesisAssistant? Create an account" : "Already have an account? Sign in"}
          </button>
          <div className="privacy-note"><span>●</span> Your documents stay on your local machine. AI inference runs through your Ollama server.</div>
        </section>
        <aside className="auth-aside"><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /><span className="aside-label">MADE FOR THE LONG WORK</span><h2>Stay close to<br /><em>the evidence.</em></h2><p>Keep your papers, notes, and questions together. Answers are grounded in the documents you choose.</p><div className="document-preview"><div className="preview-top"><span><i /> your library</span><span>3 SOURCES</span></div><div className="preview-file"><span className="pdf-badge">PDF</span><span>literature-review.pdf</span><small>14 pages</small></div><div className="preview-file"><span className="pdf-badge muted">DOC</span><span>methods-draft.docx</span><small>2 pages</small></div><div className="preview-file"><span className="pdf-badge">PDF</span><span>study-results.pdf</span><small>28 pages</small></div><div className="preview-question">What was the main outcome measure?<span>Grounded in 3 sources · 4 citations</span></div></div><span className="aside-foot">PRIVATE BY DESIGN &nbsp;·&nbsp; NO PROPRIETARY AI API</span></aside>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup compact"><span className="brand-mark">T</span><div><strong>Thesis<span>Assistant</span></strong></div></div>
        <div className="sidebar-label">WORKSPACE</div>
        <button className="nav-item active"><span className="nav-icon">▧</span> Projects <span className="count-pill">{projects.length}</span></button>
        <form className="new-project-form" onSubmit={createProject}><input aria-label="New project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="New thesis project…" /><button aria-label="Create project" type="submit" disabled={pending}>＋</button></form>
        <div className="project-list">{projects.map((item) => <div className={`project-row ${project?.id === item.id ? "selected" : ""}`} key={item.id}><button className="project-select" disabled={pending} onClick={() => { setMessages([]); setConversationId(undefined); void reloadWorkspace(item.id); }}><span className="project-dot" />{item.name}</button><button className="project-delete" title="Delete project" disabled={pending} onClick={() => void removeProject(item)}>×</button></div>)}</div>
        <div className="sidebar-bottom"><div className="user-chip"><span className="avatar">{email.slice(0, 1).toUpperCase() || "R"}</span><span className="user-email">{email || "Researcher"}<small>Local workspace</small></span><button className="logout-button" disabled={pending} onClick={signOut} title="Sign out">↗</button></div><div className="local-runtime"><span className="online-dot" /> <span>LOCAL AI RUNTIME</span> <b>OLLAMA</b></div></div>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><span className="topbar-crumb">Projects</span><span className="crumb-slash">/</span><strong>{project?.name || "Your workspace"}</strong></div><div className="runtime-status"><span className="online-dot" /> Local sources only</div></header>
        {!project ? (
          <div className="empty-projects"><div className="empty-icon">▧</div><p className="eyebrow">START WITH A PROJECT</p><h1>A home for your research.</h1><p className="subtle">Create a thesis project to organize source documents and ask grounded research questions.</p><form className="create-first" onSubmit={createProject}><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="e.g. Urban Heat and Public Health" /><button type="submit" className="primary-button">Create project</button></form></div>
        ) : (
          <div className="research-layout">
            <section className="chat-panel"><div className="panel-heading"><div><span className="eyebrow">RESEARCH ASSISTANT</span><h1>{project.name}</h1></div><button className="quiet-button" disabled={pending} onClick={() => { setMessages([]); setConversationId(undefined); }}>＋ <span>New chat</span></button></div>
              <div className="chat-scroll"><div className="assistant-welcome"><div className="assistant-avatar">T</div><div><strong>Your research companion</strong><p>Ask a question about your sources. I’ll keep answers tied to what your documents actually say.</p></div></div>
                {messages.map((message, index) => <article className={`message ${message.role}`} key={index}><div className="message-avatar">{message.role === "assistant" ? "T" : (email.slice(0, 1).toUpperCase() || "Y")}</div><div className="message-body"><div className="message-meta">{message.role === "assistant" ? "THESISASSISTANT" : "YOU"}</div><p className="message-content">{message.content || (pending && index === messages.length - 1 ? <span className="thinking-dots">Thinking<span> · grounded in your sources</span></span> : "")}</p>{message.citations && message.citations.length > 0 && <div className="message-citations"><span className="citation-label">SOURCES</span>{message.citations.map((citation, citationIndex) => <button className="citation-chip" key={`${citation.filename}-${citation.page}-${citationIndex}`} onClick={() => setSelectedCitation(citation)}>↗ {citation.filename} <b>{locatorLabel(citation)}</b></button>)}</div>}{message.role === "assistant" && message.citations?.length ? <button className="text-button save-answer" disabled={message.saved} onClick={() => void saveNote(message)}>{message.saved ? "✓ Saved to notes" : "↳ Save answer as a note"}</button> : null}</div></article>)}
              </div>
              {selectedCitation && project && <SourcePreview projectId={project.id} citation={selectedCitation} onClose={() => setSelectedCitation(null)} />}
              {notice && <div className="notice workspace-notice">{notice}<button onClick={() => setNotice("")}>×</button></div>}
              <form className="chat-composer" onSubmit={ask}><div className="composer-context"><span className="online-dot" /> Answering from {files.length} {files.length === 1 ? "source" : "sources"} in this project</div><div className="composer-input"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder={files.length ? "Ask a question about your documents…" : "Upload a source to start asking questions…"} rows={2} disabled={!files.some((file) => file.status === "ready") || pending} /><button type="submit" className="send-button" disabled={!files.some((file) => file.status === "ready") || !question.trim() || pending} aria-label="Send question">↑</button></div><div className="composer-foot">{pending && <button type="button" onClick={() => requestController.current?.abort()}>Stop response</button>}<span>Grounded in your sources, not the open web.</span><span>↵ Send &nbsp; ⇧↵ New line</span></div></form>
            </section>
            <aside className="sources-panel"><div className="sources-heading"><div><span className="eyebrow">YOUR MATERIALS</span><h2>Sources <span className="count-pill">{files.length}</span></h2></div><label className="upload-button">＋ Add source<input type="file" accept=".pdf,.docx,.txt" multiple hidden disabled={pending} onChange={uploadFiles} /></label></div><div className="upload-drop"><div className="upload-symbol">↑</div><strong>Add your documents</strong><span>PDF, DOCX, TXT · max 25 MB each</span><label className="browse-files">Browse files<input type="file" accept=".pdf,.docx,.txt" multiple hidden disabled={pending} onChange={uploadFiles} /></label></div><div className="file-list">{files.map((file) => <article className="source-card" key={file.id}><div className={`file-icon ${file.filename.toLowerCase().endsWith("pdf") ? "pdf" : "doc"}`}>{file.filename.toLowerCase().endsWith("pdf") ? "PDF" : file.filename.split(".").pop()?.toUpperCase()}</div><div className="source-meta"><strong title={file.filename}>{file.filename}</strong><span>{file.status === "ready" ? "Indexed · Ready to cite" : file.status}{file.warning ? " · Pagination notice" : ""}</span></div><div className="source-actions"><button title="Summarize document" disabled={pending || file.status !== "ready"} onClick={() => void summarize(file)}>✦</button><button title="Delete source" disabled={pending} onClick={() => void removeFile(file)}>×</button></div>{file.warning && <p className="file-warning">{file.warning}</p>}</article>)}{files.length === 0 && <p className="sources-empty">Your source list will appear here. We’ll show each file’s indexing status before it’s used.</p>}</div><div className="notes-heading"><div><span className="eyebrow">YOUR NOTES</span><h2>Saved answers <span className="count-pill">{notes.length}</span></h2></div></div><div className="note-list">{notes.map((note) => <article className="note-card" key={note.id}><strong>{note.title}</strong><details><summary>Read saved answer</summary><p>{note.content}</p></details>{note.citations_json && <small>◷ Source citations included</small>}</article>)}{notes.length === 0 && <p className="sources-empty">Save a cited answer to keep it with this project.</p>}</div><div className="source-foot"><span className="lock-icon">◇</span> Sources are processed by your configured Ollama server.</div></aside>
          </div>
        )}
      </section>
    </main>
  );
}
