"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { Brand } from "./Brand";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Command,
  Download,
  Focus,
  Menu,
  MessageSquare,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { Project, Section } from "@/lib/workspace";
import {
  readLocal,
  addLocalChapter,
  reorderLocal,
} from "@/lib/local-workspace";
import { addChapter, reorderChapters } from "@/app/editor-actions";
import { ChapterEditor, type EditorHandle } from "./editor/ChapterEditor";
import { ChapterNavigation } from "./ChapterNavigation";
import { ResearchProblem } from "./ResearchProblem";
import { SourceLibrary } from "./SourceLibrary";
import { AssistantPanel } from "./AssistantPanel";
import { ThemeButton } from "./ThemeButton";
import { Otto } from "./Otto";
import { EvidenceReader } from "./EvidenceReader";
import { listSources, watchSources, type SourceInfo } from "@/lib/sources";

export function Workspace({
  local,
  projectId,
  initialProject,
  sections,
}: {
  local: boolean;
  projectId: string;
  initialProject?: Project;
  sections: Section[];
}) {
  const [project, setProject] = useState(initialProject),
    [chapters, setChapters] = useState(sections),
    [activeId, setActiveId] = useState(sections[0]?.id);
  const [loading, setLoading] = useState(local),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [focus, setFocus] = useState(false),
    [left, setLeft] = useState(true),
    [right, setRight] = useState(false),
    [docked, setDocked] = useState(false);
  const [view, setView] = useState<"editor" | "sources" | "reader">("editor"),
    [busy, setBusy] = useState(false),
    [saveLabel, setSaveLabel] = useState(
      local ? "Browser draft" : "Cloud workspace",
    );
  const [command, setCommand] = useState(false),
    [query, setQuery] = useState("");
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [sourceError, setSourceError] = useState("");
  const [sourceId, setSourceId] = useState<string>();
  const [sourceLocation, setSourceLocation] = useState<number>();
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const items = await listSources(projectId, local);
        if (alive) {
          setSources(items);
          setSourceError("");
        }
      } catch (error) {
        if (alive)
          setSourceError(
            error instanceof Error
              ? error.message
              : "Could not load source storage.",
          );
      }
    }
    void refresh();
    const stop = watchSources(() => void refresh(), local, projectId);
    return () => {
      alive = false;
      stop();
    };
  }, [local, projectId]);
  const handle = useRef<EditorHandle | null>(null),
    router = useRouter();
  const ready = useCallback((value: EditorHandle) => {
    handle.current = value;
  }, []);
  useEffect(() => {
    if (window.innerWidth < 1000) setLeft(false);
    if (window.innerWidth < 700) setRight(false);
    if (local) {
      try {
        const data = readLocal();
        setProject(data.projects.find((item) => item.id === projectId));
        const items = data.sections
          .filter((item) => item.project_id === projectId)
          .sort((a, b) => a.position - b.position);
        setChapters(items);
        setActiveId(items[0]?.id);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not read browser drafts.",
        );
      }
      setLoading(false);
    }
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (event.shiftKey) setCommand((value) => !value);
        else {
          setFocus(false);
          setRight((value) => !value);
        }
      }
      if (event.key === "Escape") setFocus(false);
    };
    const offline = () =>
      setNotice(
        local
          ? "You’re offline. Browser drafts can still save on this device."
          : "You’re offline. Keep this tab open until your draft saves, or download a backup.",
      );
    window.addEventListener("keydown", key);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("offline", offline);
    };
  }, [local, projectId]);
  const active = chapters.find((item) => item.id === activeId);
  async function flush() {
    const ok = await (handle.current?.flush() ?? Promise.resolve(true));
    if (!ok)
      setNotice(
        "Your chapter has unsaved changes. Resolve the save issue or download a backup before leaving.",
      );
    return ok;
  }
  async function select(id: string) {
    setBusy(true);
    try {
      if (await flush()) {
        setActiveId(id);
        handle.current = null;
      }
    } finally {
      setBusy(false);
    }
  }
  async function add(title: string) {
    if (!project) return;
    setBusy(true);
    try {
      if (!(await flush())) return;
      const result = local
        ? { section: await addLocalChapter(project.id, title) }
        : await addChapter(project.id, title);
      if (result.error) throw new Error(result.error);
      if (result.section) {
        setChapters((items) => [...items, result.section!]);
        setActiveId(result.section.id);
        handle.current = null;
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not add chapter.");
    } finally {
      setBusy(false);
    }
  }
  async function reorder(ordered: Section[]) {
    if (!project) return;
    setBusy(true);
    try {
      if (!(await flush())) return;
      // The flush can advance the active revision. Refresh revisions before the atomic reorder.
      const snapshot = local
        ? ordered.map(
            (item) =>
              readLocal().sections.find((latest) => latest.id === item.id) ??
              item,
          )
        : ordered.map((item) =>
            item.id === latestSaved.current?.id ? latestSaved.current : item,
          );
      if (local) setChapters(await reorderLocal(project.id, snapshot));
      else {
        const result = await reorderChapters(
          project.id,
          snapshot.map((item) => ({ id: item.id, revision: item.revision })),
        );
        if (result.error) throw new Error(result.error);
        setChapters(
          snapshot.map((item, position) => ({
            ...item,
            position,
            revision: item.revision + 1,
          })),
        );
      }
      // Remount the editor with the acknowledged revision, preserving the saved content.
      setEditorGeneration((value) => value + 1);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not reorder chapters.");
    } finally {
      setBusy(false);
    }
  }
  const latestSaved = useRef<Section | null>(null);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const saved = useCallback((section: Section) => {
    latestSaved.current = section;
    setChapters((items) =>
      items.map((item) => (item.id === section.id ? section : item)),
    );
  }, []);
  const unavailable = (feature: string) =>
    setNotice(
      feature +
        " arrives in a later milestone. No AI answers or source results are being generated yet.",
    );
  const showSources = async () => {
    if (await flush()) setView("sources");
  };
  const commands = [
    {
      label: "Back to my theses",
      run: async () => {
        if (await flush()) router.push("/");
      },
    },
    { label: "Show sources", run: showSources },
    {
      label: focus ? "Leave focus mode" : "Enter focus mode",
      run: () => setFocus((value) => !value),
    },
    { label: "Add chapter", run: () => add("Untitled chapter") },
    { label: "Download chapter backup", run: () => handle.current?.download() },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  if (loading)
    return (
      <main className="center-state">
        <h1>Opening your thesis…</h1>
      </main>
    );
  if (!project)
    return (
      <main className="center-state">
        <h1>Thesis unavailable.</h1>
        <p>
          {error ||
            "This project does not exist in this browser. Cloud projects need a signed-in account."}
        </p>
        <Link href="/" className="primary">
          Back to your theses
        </Link>
      </main>
    );
  return (
    <div
      className={"workspace wireframe-workspace" + (focus ? " is-focused" : "")}
    >
      <a className="skip-link" href="#writing-surface">
        Skip to document
      </a>
      <header className="topbar">
        <Link
          href="/"
          className="wordmark"
          onClick={async (event) => {
            event.preventDefault();
            if (await flush()) router.push("/");
          }}
        >
          <Brand />
        </Link>
        <span className="top-divider" />
        <span className="workspace-title">{project.title}</span>
        <div className="top-actions">
          {view !== "editor" ? (
            <button className="secondary" onClick={() => setView("editor")}>
              <ArrowLeft size={16} />
              Back to editor
            </button>
          ) : (
            <>
              <details className="save-details">
                <summary className="save-indicator">{saveLabel}</summary>
                <div>
                  <p>
                    {local
                      ? "Browser draft · saved on this device, not your account."
                      : "Your private cloud workspace."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => handle.current?.download()}
                    disabled={!active}
                  >
                    <Download size={12} /> Download chapter backup
                  </button>
                </div>
              </details>
              <button
                className="icon-button"
                aria-label="Open command palette"
                title="Commands (Ctrl/⌘ Shift K)"
                onClick={() => setCommand(true)}
              >
                <Command size={17} />
              </button>
              <ThemeButton />
              <button
                className="quiet-button"
                aria-pressed={focus}
                onClick={() => setFocus((value) => !value)}
              >
                <Focus size={16} />
                {focus ? "Exit focus" : "Focus mode"}
              </button>
              <button
                className="secondary share-button"
                onClick={() =>
                  setNotice(
                    "Sharing is not connected yet. Browser drafts stay on this device. Download a chapter backup from the save menu or command palette.",
                  )
                }
              >
                Share
              </button>
              <button
                className="primary export-button"
                onClick={() => unavailable("DOCX and PDF export")}
              >
                Export
              </button>
            </>
          )}
        </div>
      </header>
      {view === "reader" ? (
        <EvidenceReader
          section={active}
          projectId={projectId}
          sourceId={sourceId}
          initialLocation={sourceLocation}
          local={local}
          onBack={() => setView("sources")}
        />
      ) : view === "sources" ? (
        <SourceLibrary
          projectId={projectId}
          local={local}
          sources={sources}
          storageError={sourceError}
          onReader={(id) => {
            setSourceId(id);
            setSourceLocation(undefined);
            setView("reader");
          }}
        />
      ) : (
        <div
          className="workspace-grid"
          style={
            {
              "--left-width": left && !focus ? "272px" : "0px",
              "--right-width": right && docked && !focus ? "380px" : "0px",
            } as CSSProperties
          }
        >
          {left && !focus && (
            <ChapterNavigation
              project={project}
              sourceCount={sources.length}
              sections={chapters}
              activeId={activeId}
              onSelect={(id) => void select(id)}
              onAdd={(title) => void add(title)}
              onReorder={(items) => void reorder(items)}
              onSources={() => void showSources()}
              busy={busy}
            />
          )}
          <main className="writing-pane" id="writing-surface" tabIndex={-1}>
            <div className="document-toolbar">
              <div className="document-crumb">
                <button
                  className="icon-button"
                  aria-label={left ? "Hide navigation" : "Show navigation"}
                  onClick={() => {
                    setFocus(false);
                    setLeft((value) => !value);
                  }}
                >
                  <Menu size={17} />
                </button>
                <span>{active?.title ?? "Your first section"}</span>
              </div>
              <button
                className="quiet-button"
                onClick={() => {
                  setFocus(false);
                  setRight((value) => !value);
                }}
              >
                <MessageSquare size={16} />
                {right && !focus ? "Hide assistant" : "Show assistant"}
              </button>
            </div>
            {active ? (
              <ChapterEditor
                key={active.id + ":" + editorGeneration}
                section={active}
                local={local}
                onSaved={saved}
                onReady={ready}
                onStatus={setSaveLabel}
                researchProblem={
                  <ResearchProblem
                    key={project.id}
                    project={project}
                    local={local}
                    onSaved={setProject}
                  />
                }
                onUnavailable={unavailable}
              />
            ) : (
              <div className="empty-editor">
                <Otto pose="welcome" />
                <h1>Start your first section</h1>
                <p>Pick a way to begin. You can change your mind anytime.</p>
                <div className="start-options">
                  <button onClick={() => void add("Introduction")}>
                    <Plus size={22} />
                    <strong>Create an outline</strong>
                    <span>
                      Add chapters around your main ideas. You stay the author.
                    </span>
                  </button>
                  <button onClick={() => void showSources()}>
                    <BookOpen size={22} />
                    <strong>Upload sources first</strong>
                    <span>
                      Explore the library. Uploads connect in the next
                      milestone.
                    </span>
                  </button>
                  <button onClick={() => void add("Untitled chapter")}>
                    <ArrowLeft size={22} />
                    <strong>Write from scratch</strong>
                    <span>Open a blank chapter and start writing.</span>
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
      <div hidden={view !== "editor" || focus}>
        <AssistantPanel
          key={projectId}
          projectId={projectId}
          local={local}
          onCitation={async citation => {
            if (await flush()) {
              setSourceId(citation.source_id);
              setSourceLocation(citation.location);
              setView("reader");
            }
          }}
          open={right && view === "editor" && !focus}
          docked={docked}
          onOpenChange={setRight}
          onDockChange={setDocked}
          onSources={() => void showSources()}
          onUnavailable={unavailable}
        />
      </div>
      <nav className="mobile-nav" aria-label="Mobile workspace">
        <button
          onClick={() => {
            setView("editor");
            setFocus(false);
            setLeft((value) => !value);
            setRight(false);
          }}
        >
          Chapters
        </button>
        <button
          onClick={() => {
            setView("editor");
            setLeft(false);
            setRight(false);
          }}
        >
          Document
        </button>
        <button
          onClick={() => {
            setView("editor");
            setFocus(false);
            setRight((value) => !value);
            setLeft(false);
          }}
        >
          Assistant
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <Dialog.Root
        open={command}
        onOpenChange={(value) => {
          setCommand(value);
          setQuery("");
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content command-dialog">
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search writing and navigation actions.
            </Dialog.Description>
            <div className="command-search">
              <Search size={18} />
              <input
                aria-label="Search commands"
                placeholder="Find a workspace action…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Dialog.Close className="icon-button" aria-label="Close commands">
                <X size={17} />
              </Dialog.Close>
            </div>
            <div className="command-results">
              {commands.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setCommand(false);
                    setQuery("");
                    void item.run();
                  }}
                >
                  {item.label}
                </button>
              ))}
              {!commands.length && <p>No matching commands.</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
