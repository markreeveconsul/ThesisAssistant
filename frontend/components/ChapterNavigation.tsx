"use client";
import { useState } from "react";
import {
  BookOpen,
  FileText,
  Plus,
  ArrowUp,
  ArrowDown,
  Upload,
  Library,
} from "lucide-react";
import type { Project, Section } from "@/lib/workspace";
export function ChapterNavigation({
  project,
  sourceCount,
  sections,
  activeId,
  onSelect,
  onAdd,
  onReorder,
  onSources,
  busy,
}: {
  project: Project;
  sourceCount: number;
  sections: Section[];
  activeId?: string;
  onSelect: (id: string) => void;
  onAdd: (title: string) => void;
  onReorder: (sections: Section[]) => void;
  onSources: () => void;
  busy: boolean;
}) {
  const [adding, setAdding] = useState(false),
    [title, setTitle] = useState(""),
    [dragged, setDragged] = useState<string | null>(null);
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= sections.length) return;
    const next = [...sections];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onReorder(next);
  }
  return (
    <aside className="left-panel editor-nav" aria-label="Project navigation">
      <div className="project-heading">
        <span className="project-monogram">
          <BookOpen size={19} />
        </span>
        <strong>{project.title}</strong>
      </div>
      <div className="nav-body">
        <div className="section-label">
          Chapters
          <button
            className="icon-button"
            aria-label="Add chapter"
            disabled={busy}
            onClick={() => setAdding(true)}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="chapter-list">
          {sections.map((section, index) => (
            <div
              className={
                "chapter-row" + (activeId === section.id ? " active" : "")
              }
              key={section.id}
              draggable={!busy}
              onDragStart={() => setDragged(section.id)}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged)
                  move(
                    sections.findIndex((item) => item.id === dragged),
                    index,
                  );
                setDragged(null);
              }}
            >
              <button
                className="chapter-select"
                disabled={busy}
                onClick={() => onSelect(section.id)}
                aria-current={activeId === section.id ? "page" : undefined}
              >
                <span>{index + 1}</span>
                {section.title}
              </button>
              <div className="chapter-order">
                <button
                  aria-label={"Move " + section.title + " up"}
                  disabled={busy || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  aria-label={"Move " + section.title + " down"}
                  disabled={busy || index === sections.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {adding ? (
          <form
            className="add-chapter-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim()) {
                onAdd(title.trim());
                setTitle("");
                setAdding(false);
              }
            }}
          >
            <label>
              New chapter title
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={160}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Add chapter
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="add-chapter"
            disabled={busy}
            onClick={() => setAdding(true)}
          >
            <Plus size={15} />
            Add chapter
          </button>
        )}
        <div className="source-nav">
          <div className="section-label">Sources ({sourceCount})</div>
          <p>Your evidence, close at hand.</p>
          <button className="upload-outline" onClick={onSources}>
            <Upload size={16} />
            Upload sources
          </button>
          <button className="nav-help" onClick={onSources}>
            <Library size={16} />
            Open source library
          </button>
        </div>
      </div>
      <div className="nav-bottom">
        <span className="private-label">
          <FileText size={13} /> {project.citation_style.toUpperCase()} ·
          Editable chapters
        </span>
      </div>
    </aside>
  );
}
