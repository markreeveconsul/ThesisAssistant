"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  FileText,
  Focus,
  HelpCircle,
  Library,
  List,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { NewProject } from "./NewProject";
import { Manuscript } from "./Manuscript";
import { AssistantPanel } from "./AssistantPanel";
import { signOut } from "@/app/auth/actions";
import type { Project, Section } from "@/lib/workspace";

type Tab = "outline" | "sources" | "notes";
import { sampleChapters } from "@/lib/sample-manuscript";
const sampleSections = [
  "Research context",
  "Student engagement",
  "The role of feedback",
  "Research gap",
];

export function Workspace({
  preview,
  projects,
  activeProject,
  sections,
  email,
}: {
  preview: boolean;
  projects: Project[];
  activeProject?: Project;
  sections: Section[];
  email?: string;
}) {
  const [tab, setTab] = useState<Tab>("outline");
  const [chapter, setChapter] = useState(
    preview ? "Literature review" : (sections[0]?.title ?? ""),
  );
  const [projectTitle, setProjectTitle] = useState(
    activeProject?.title ??
      (preview ? "Learning through feedback" : "Your thesis workspace"),
  );
  const [sample, setSample] = useState(preview);
  const [dark, setDark] = useState(false);
  const [focus, setFocus] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [offline, setOffline] = useState(false);
  const [panelWidth, setPanelWidth] = useState(326);
  const commandRef = useRef<HTMLInputElement>(null);
  const navVisible = !focus && leftOpen;
  const assistantVisible = !focus && rightOpen;
  useEffect(() => {
    const saved = localStorage.getItem("thesisdesk-theme");
    setDark(
      saved === "dark" ||
        (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches),
    );
    if (window.innerWidth <= 980) setLeftOpen(false);
    if (window.innerWidth <= 640) setRightOpen(false);
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  const toggleTheme = () =>
    setDark((value) => {
      localStorage.setItem("thesisdesk-theme", value ? "light" : "dark");
      return !value;
    });
  const upcoming = (feature: string) =>
    setNotice(
      feature +
        " is not connected yet. This milestone establishes the workspace and account foundation.",
    );
  const commands = [
    { label: "New project", hint: "Workspace", run: () => setNewOpen(true) },
    {
      label: "Show outline",
      hint: "Navigation",
      run: () => {
        setFocus(false);
        setLeftOpen(true);
        setTab("outline");
      },
    },
    {
      label: "Show sources",
      hint: "Navigation",
      run: () => {
        setFocus(false);
        setLeftOpen(true);
        setTab("sources");
      },
    },
    {
      label: "Show notes",
      hint: "Navigation",
      run: () => {
        setFocus(false);
        setLeftOpen(true);
        setTab("notes");
      },
    },
    {
      label: focus ? "Leave focus mode" : "Enter focus mode",
      hint: "Writing",
      run: () => setFocus((value) => !value),
    },
    {
      label: dark ? "Use light theme" : "Use dark theme",
      hint: "Appearance",
      run: toggleTheme,
    },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  const chapterNames = sample
    ? sampleChapters
    : sections
        .filter((section) => !section.parent_id)
        .map((section) => section.title);
  return (
    <div className={"workspace" + (focus ? " is-focused" : "")}>
      <a className="skip-link" href="#writing-surface">
        Skip to document
      </a>
      <header className="topbar">
        <Link href="/" className="wordmark">
          <BookOpen size={24} strokeWidth={1.7} />
          <span>
            ThesisDesk<span className="brand-dot">.</span>
          </span>
        </Link>
        <span className="top-divider" />
        <div className="project-location">
          <span className="muted">My workspace</span>
          <ChevronRight size={13} />
          <span>{projectTitle}</span>
        </div>
        <div className="top-actions">
          <span className="save-indicator">
            <span className="status-dot" />
            {preview ? "Layout preview" : "Workspace connected"}
          </span>
          <button
            className="icon-button"
            aria-label="Open command palette"
            title="Commands (Ctrl / Cmd + K)"
            onClick={() => setCommandOpen(true)}
          >
            <Command size={17} />
          </button>
          <button
            className="icon-button theme-toggle"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={toggleTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="avatar"
            aria-label="Account and workspace information"
            onClick={() => setHelpOpen(true)}
          >
            {email?.slice(0, 2).toUpperCase() ?? "TD"}
          </button>
        </div>
      </header>
      {offline && (
        <div role="status" className="connection-banner">
          You’re offline. Account changes need an internet connection.
        </div>
      )}
      <div
        className="workspace-grid"
        style={
          {
            "--left-width": navVisible ? "240px" : "0px",
            "--right-width": assistantVisible ? panelWidth + "px" : "0px",
          } as CSSProperties
        }
      >
        {navVisible && (
          <aside className="left-panel" aria-label="Project navigation">
            <div className="project-heading">
              <span className="project-monogram">
                <BookOpen size={19} />
              </span>
              <div>
                <strong>{projectTitle}</strong>
                <span>{sample ? "EXAMPLE THESIS" : "THESIS PROJECT"}</span>
              </div>
              <button
                className="icon-button"
                aria-label="Hide navigation"
                onClick={() => setLeftOpen(false)}
              >
                <PanelLeftClose size={16} />
              </button>
            </div>
            {projects.length > 1 && (
              <label className="project-select">
                <span className="sr-only">Switch project</span>
                <select
                  value={activeProject?.id}
                  onChange={(event) => {
                    window.location.href =
                      "/?project=" + encodeURIComponent(event.target.value);
                  }}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="search-trigger"
              onClick={() => setCommandOpen(true)}
            >
              <Search size={15} />
              <span>Find or jump to…</span>
              <kbd>⌘ K</kbd>
            </button>
            <nav className="nav-tabs" aria-label="Project views">
              {(
                [
                  { id: "outline", label: "Outline", Icon: List },
                  { id: "sources", label: "Sources", Icon: Library },
                  { id: "notes", label: "Notes", Icon: Bookmark },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  onClick={() => setTab(id)}
                >
                  <Icon size={17} />
                  {label}
                  {id === "sources" && <span className="count">0</span>}
                </button>
              ))}
            </nav>
            <div className="nav-body">
              <div className="section-label">
                {tab === "outline"
                  ? "THESIS OUTLINE"
                  : tab === "sources"
                    ? "SOURCE LIBRARY"
                    : "RESEARCH NOTES"}
                <button
                  className="icon-button"
                  aria-label={
                    tab === "outline"
                      ? "Add chapter"
                      : tab === "sources"
                        ? "Add source"
                        : "Add note"
                  }
                  onClick={() =>
                    upcoming(
                      tab === "outline"
                        ? "Chapter editing"
                        : tab === "sources"
                          ? "Source upload"
                          : "Notes",
                    )
                  }
                >
                  <Plus size={15} />
                </button>
              </div>
              {tab === "outline" ? (
                <>
                  <div className="chapters">
                    {chapterNames.map((name, index) => (
                      <div key={name + index}>
                        <button
                          className={
                            "chapter-button" +
                            (chapter === name ? " active" : "")
                          }
                          onClick={() => setChapter(name)}
                        >
                          {chapter === name ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                          <span className="chapter-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>{name}</span>
                        </button>
                        {sample &&
                          chapter === name &&
                          name === "Literature review" && (
                            <div className="subsections">
                              {sampleSections.map((title, i) => (
                                <button
                                  key={title}
                                  onClick={() =>
                                    document
                                      .getElementById("sample-section-" + i)
                                      ?.scrollIntoView({
                                        behavior: window.matchMedia(
                                          "(prefers-reduced-motion: reduce)",
                                        ).matches
                                          ? "instant"
                                          : "smooth",
                                        block: "center",
                                      })
                                  }
                                >
                                  {title}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                  {!chapterNames.length && (
                    <p className="nav-empty">
                      Your chapters will appear here. The editor arrives in the
                      next milestone.
                    </p>
                  )}
                  <button
                    className="add-chapter"
                    onClick={() => upcoming("Chapter editing")}
                  >
                    <Plus size={15} /> Add chapter
                  </button>
                  <div className="bibliography-link">
                    <BookOpen size={15} />
                    <span>Bibliography</span>
                    <span className="small-tag">
                      {activeProject?.citation_style.toUpperCase() ?? "APA"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="nav-empty">
                  <p>
                    {tab === "sources"
                      ? "Your evidence belongs here."
                      : "Keep useful ideas close."}
                  </p>
                  <span>
                    {tab === "sources"
                      ? "Uploaded papers and processing status will appear in this library."
                      : "Saved answers and your research notes will appear here."}
                  </span>
                  <button
                    className="secondary"
                    onClick={() =>
                      upcoming(tab === "sources" ? "Source upload" : "Notes")
                    }
                  >
                    {tab === "sources" ? "About source uploads" : "About notes"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
            <div className="nav-bottom">
              <button
                className="new-project-button"
                onClick={() => setNewOpen(true)}
              >
                <Plus size={16} /> New project
              </button>
              <button className="nav-help" onClick={() => setHelpOpen(true)}>
                <HelpCircle size={16} /> Workspace guide
                <ChevronRight size={14} />
              </button>
              <div className="private-label">
                <ShieldCheck size={13} />
                {preview ? "Sample content · not saved" : "Private workspace"}
              </div>
            </div>
          </aside>
        )}
        <main id="writing-surface" tabIndex={-1} className="writing-pane">
          <div className="document-toolbar">
            <div className="document-crumb">
              {!navVisible && (
                <button
                  className="icon-button"
                  aria-label="Show navigation"
                  onClick={() => {
                    setFocus(false);
                    setLeftOpen(true);
                  }}
                >
                  <Menu size={17} />
                </button>
              )}
              <FileText size={15} />
              <span>{chapter || "Your first chapter"}</span>
            </div>
            <div className="document-tools">
              <button
                className={"quiet-button" + (focus ? " selected" : "")}
                aria-pressed={focus}
                onClick={() => setFocus((value) => !value)}
              >
                <Focus size={15} />
                <span>{focus ? "Exit focus" : "Focus"}</span>
              </button>
              <span className="toolbar-divider" />
              <button
                className="quiet-button"
                onClick={() => upcoming("Document export")}
              >
                <ArrowDownToLine size={15} />
                <span>Export</span>
              </button>
              {!assistantVisible && (
                <button
                  className="icon-button"
                  aria-label="Show assistant"
                  onClick={() => {
                    setFocus(false);
                    setRightOpen(true);
                  }}
                >
                  <MessageSquare size={17} />
                </button>
              )}
            </div>
          </div>
          <div
            className="formatting-preview"
            aria-label="Editor toolbar preview"
          >
            <span>
              Normal text <ChevronDown size={12} />
            </span>
            <i />
            <span className="format-serif">Source Serif 4</span>
            <i />
            <strong>B</strong>
            <em>I</em>
            <u>U</u>
            <i />
            <List size={16} />
            <span className="format-cite">[ ” ]</span>
            <span className="read-only-label">READ-ONLY PREVIEW</span>
          </div>
          <div
            className="paper-scroller"
            tabIndex={0}
            role="region"
            aria-label="Manuscript preview"
          >
            <div className="paper-meta">
              <span>{sample ? "EXAMPLE DOCUMENT" : "YOUR MANUSCRIPT"}</span>
              <span>
                {sample
                  ? "A glimpse of your writing space"
                  : "Foundation · editor coming next"}
              </span>
            </div>
            <Manuscript
              sample={sample}
              chapter={chapter}
              activeProject={activeProject}
              projectTitle={projectTitle}
              preview={preview}
              onNewProject={() => setNewOpen(true)}
            />
          </div>
          <footer className="document-status">
            <span>
              <span className="status-dot" />
              {preview
                ? "Preview only · changes are not saved"
                : "Editor not enabled yet"}
            </span>
            <span>
              English <span className="status-separator">/</span>{" "}
              {sample ? "Example manuscript" : "0 words"}
            </span>
          </footer>
        </main>
        {assistantVisible && (
          <AssistantPanel
            panelWidth={panelWidth}
            setPanelWidth={setPanelWidth}
            onHide={() => setRightOpen(false)}
            onSources={() => {
              setTab("sources");
              setLeftOpen(true);
            }}
            onUnavailable={upcoming}
          />
        )}
      </div>
      <nav className="mobile-nav" aria-label="Mobile workspace">
        <button
          onClick={() => {
            setFocus(false);
            setLeftOpen((value) => !value);
            setRightOpen(false);
          }}
        >
          <List size={18} />
          Outline
        </button>
        <button
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        >
          <FileText size={18} />
          Document
        </button>
        <button
          onClick={() => {
            setFocus(false);
            setRightOpen((value) => !value);
            setLeftOpen(false);
          }}
        >
          <MessageSquare size={18} />
          Assistant
        </button>
      </nav>
      {notice && (
        <div role="status" className="toast">
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
      <Dialog.Root open={newOpen} onOpenChange={setNewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <Dialog.Title>A new chapter starts here.</Dialog.Title>
            <Dialog.Description>
              Create a home for your thesis and its sources.
            </Dialog.Description>
            <NewProject
              preview={preview}
              onPreviewCreate={(name) => {
                setProjectTitle(name);
                setSample(false);
                setChapter("");
                setNewOpen(false);
                setNotice(
                  "Preview project created. It will reset on reload; no data has been saved.",
                );
              }}
            />
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="Close new project"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={commandOpen}
        onOpenChange={(value) => {
          setCommandOpen(value);
          setQuery("");
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="dialog-content command-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              commandRef.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <Dialog.Description className="sr-only">
              Search workspace actions. Tab through results and press Enter to
              choose.
            </Dialog.Description>
            <div className="command-search">
              <Search size={19} />
              <input
                ref={commandRef}
                aria-label="Search commands"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Where would you like to go?"
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
                    setCommandOpen(false);
                    setQuery("");
                    item.run();
                  }}
                >
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              ))}
              {!commands.length && <p>No matching commands.</p>}
            </div>
            <div className="command-footer">
              Tab to navigate <span>↵ to select</span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content">
            <span className="eyebrow">MILESTONE 1 / FOUNDATION</span>
            <Dialog.Title>Your writing comes first.</Dialog.Title>
            <Dialog.Description>
              {preview
                ? "You’re exploring a layout preview. No documents, sources, or AI answers are being saved or generated."
                : "Your account and projects are connected. Document editing is the next milestone."}
            </Dialog.Description>
            <ul className="guide-list">
              <li>
                <Check size={16} />
                Explore outline, sources, and notes
              </li>
              <li>
                <Check size={16} />
                Resize or collapse the assistant
              </li>
              <li>
                <Check size={16} />
                Use focus mode and light/dark themes
              </li>
              <li>
                <Command size={16} />
                Ctrl / Cmd + K opens workspace commands
              </li>
            </ul>
            {preview ? (
              <Link href="/auth" className="primary">
                Account setup
                <ArrowRight size={16} />
              </Link>
            ) : (
              <form action={signOut}>
                <p className="muted">{email}</p>
                <button className="secondary">Sign out</button>
              </form>
            )}
            <Dialog.Close
              className="dialog-close icon-button"
              aria-label="Close workspace guide"
            >
              <X size={18} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
