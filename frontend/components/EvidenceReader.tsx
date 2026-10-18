"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileText,
  Minus,
  Plus,
  Download,
} from "lucide-react";
import type { Section } from "@/lib/workspace";
import { validateDocument, type DocumentNode } from "@/lib/document";
import {
  getSource,
  locatorLabel,
  watchSources,
  type StoredSource,
} from "@/lib/sources";
import { PdfPage } from "./PdfPage";
function excerpt(node: DocumentNode): string {
  return (
    node.text ||
    (node.content ?? []).map(excerpt).join(node.type === "doc" ? "\n\n" : "")
  );
}
export function EvidenceReader({
  section,
  projectId,
  sourceId,
  initialLocation,
  local,
  onBack,
}: {
  section?: Section;
  projectId: string;
  sourceId?: string;
  initialLocation?: number;
  local: boolean;
  onBack: () => void;
}) {
  const [source, setSource] = useState<StoredSource | null>(null),
    [loading, setLoading] = useState(Boolean(sourceId)),
    [error, setError] = useState("");
  const [position, setPosition] = useState(0),
    [zoom, setZoom] = useState(1),
    [query, setQuery] = useState(""),
    [message, setMessage] = useState("");
  const [locationInput, setLocationInput] = useState("1");
  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (!sourceId || !local) {
        setSource(null);
        setLoading(false);
        return;
      }
      try {
        const value = await getSource(projectId, sourceId);
        if (alive) {
          setSource(value);
          if (initialLocation !== undefined && value) {
            const index = value.pages.findIndex(page => page.page_number === initialLocation);
            setPosition(Math.max(0, index));
          }
          setError(
            value
              ? ""
              : "This source is no longer available in this project's library.",
          );
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Could not load the source.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    setLoading(Boolean(sourceId));
    setPosition(0);
    setZoom(1);
    setQuery("");
    void refresh();
    const stop = watchSources(() => void refresh());
    return () => {
      alive = false;
      stop();
    };
  }, [sourceId, projectId, local, initialLocation]);
  const text =
    section && validateDocument(section.content)
      ? excerpt(section.content).slice(0, 1800)
      : "";
  const page = source?.pages[position];
  useEffect(
    () => setLocationInput(String(page?.page_number ?? 1)),
    [page?.page_number],
  );
  const matches =
    source?.pages
      .map((item, index) =>
        item.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())
          ? index
          : -1,
      )
      .filter((index) => index >= 0) ?? [];
  function findNext() {
    setPosition(
      matches.find((index) => index > position) ?? matches[0] ?? position,
    );
  }
  function download() {
    if (!source) return;
    const url = URL.createObjectURL(source.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = source.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const label = source ? locatorLabel(source.format) : "Page";
  return (
    <main className="evidence-reader">
      <button className="quiet-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to sources
      </button>
      <div className="reader-grid">
        <section className="reader-context">
          <span className="eyebrow">YOUR DOCUMENT</span>
          <h1>{section?.title || "Your first section"}</h1>
          <p className="reader-excerpt">
            {text ||
              "Your writing appears here so you can compare it with the original source."}
          </p>
          <div className="reader-relevance">
            Compare the source with your draft. No AI interpretation or
            relevance score is being generated.
          </div>
        </section>
        <section className="reader-viewer" aria-label="Evidence viewer">
          <header>
            <FileText size={18} />
            <strong>{source?.filename || "No source selected"}</strong>
            {source && (
              <button
                className="icon-button"
                onClick={download}
                aria-label="Download original source"
              >
                <Download size={17} />
              </button>
            )}
          </header>
          {loading && (
            <p role="status" className="notice">
              Opening source…
            </p>
          )}
          {error && (
            <p role="alert" className="source-errors">
              {error}
            </p>
          )}
          {source && page ? (
            <>
              {source.warning && (
                <p className="source-warning">{source.warning}</p>
              )}
              <div className="source-navigation">
                <button
                  className="icon-button"
                  aria-label="Previous location"
                  disabled={position === 0}
                  onClick={() => setPosition(position - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <label>
                  {label}
                  <input
                    aria-label={`Go to ${label.toLowerCase()}`}
                    type="number"
                    min={1}
                    max={source.pages.at(-1)?.page_number}
                    value={locationInput}
                    onBlur={() => setLocationInput(String(page.page_number))}
                    onChange={(event) => {
                      setLocationInput(event.target.value);
                      const index = source.pages.findIndex(
                        (item) =>
                          item.page_number === Number(event.target.value),
                      );
                      if (index >= 0) setPosition(index);
                    }}
                  />
                </label>
                <span>
                  {position + 1} of {source.pages.length} locations
                </span>
                <button
                  className="icon-button"
                  aria-label="Next location"
                  disabled={position === source.pages.length - 1}
                  onClick={() => setPosition(position + 1)}
                >
                  <ChevronRight size={18} />
                </button>
                {source.format === "pdf" && (
                  <>
                    <button
                      className="icon-button"
                      aria-label="Zoom out"
                      disabled={zoom <= 0.5}
                      onClick={() =>
                        setZoom((value) => Math.max(0.5, value - 0.25))
                      }
                    >
                      <Minus size={16} />
                    </button>
                    <span>{Math.round(zoom * 100)}%</span>
                    <button
                      className="icon-button"
                      aria-label="Zoom in"
                      disabled={zoom >= 2}
                      onClick={() =>
                        setZoom((value) => Math.min(2, value + 0.25))
                      }
                    >
                      <Plus size={16} />
                    </button>
                  </>
                )}
              </div>
              <form
                className="source-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  findNext();
                }}
              >
                <label className="sr-only" htmlFor="source-search">
                  Search source text
                </label>
                <input
                  id="source-search"
                  value={query}
                  maxLength={200}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search extracted text…"
                />
                <button
                  className="secondary"
                  disabled={!query.trim() || !matches.length}
                >
                  Find next
                </button>
                {query && (
                  <span role="status">
                    {matches.length} matching{" "}
                    {locatorLabel(source.format, true).toLowerCase()}
                  </span>
                )}
              </form>
              {source.format === "pdf" && (
                <PdfPage
                  blob={source.blob}
                  number={page.page_number}
                  zoom={zoom}
                  filename={source.filename}
                />
              )}
              <div className="extracted-text">
                <h2>
                  Extracted text · {label.toLowerCase()} {page.page_number}
                </h2>
                <p
                  tabIndex={0}
                  role="region"
                  aria-label="Extracted source text"
                >
                  {page.text ||
                    "No extractable text on this page. It may be scanned; OCR is not supported."}
                </p>
              </div>
              <footer>
                <span>
                  {source.filename} · {label.toLowerCase()} {page.page_number}
                </span>
                <button
                  className="secondary"
                  disabled={!page.text}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `${page.text}\n\n[${source.filename}, ${label.toLowerCase()} ${page.page_number}]`,
                      );
                      setMessage("Text and source location copied.");
                    } catch {
                      setMessage(
                        "Clipboard is unavailable. Select and copy the extracted text instead.",
                      );
                    }
                  }}
                >
                  Copy text with location
                </button>
                {message && <p role="status">{message}</p>}
              </footer>
            </>
          ) : (
            !loading &&
            !error && (
              <div className="reader-paper">
                <FileText size={40} />
                <h2>Your original source goes here</h2>
                <p>
                  Choose a source from your library to view its pages or
                  extracted text.
                </p>
                <button className="secondary" onClick={onBack}>
                  Choose a source
                </button>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
