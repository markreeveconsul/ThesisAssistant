"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Upload, Trash2, BookOpen } from "lucide-react";
import { Otto } from "./Otto";
import {
  deleteSource,
  locatorLabel,
  uploadSource,
  type SourceInfo,
} from "@/lib/sources";

export function SourceLibrary({
  projectId,
  local,
  sources,
  storageError,
  onReader,
}: {
  projectId: string;
  local: boolean;
  sources: SourceInfo[];
  storageError: string;
  onReader: (id?: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [stage, setStage] = useState("");
  const [errors, setErrors] = useState<string[]>([]),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string>(),
    [removing, setRemoving] = useState<string>();
  const detail = sources.find((source) => source.id === selected) ?? sources[0];
  useEffect(() => () => operation.current?.abort(), []);
  async function upload(files: File[]) {
    if (busy || !local || !files.length) return;
    if (files.length > 10) {
      setErrors(["Choose at most 10 files at a time."]);
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setErrors([]);
    setMessage("");
    let successes = 0;
    for (const file of files) {
      if (controller.signal.aborted) break;
      try {
        const source = await uploadSource(
          projectId,
          file,
          controller.signal,
          (text) => setStage(`${file.name}: ${text}`),
        );
        setSelected(source.id);
        successes++;
      } catch (error) {
        setErrors((items) => [
          ...items,
          `${file.name}: ${error instanceof Error ? error.message : "Upload failed."}`,
        ]);
      }
    }
    setBusy(false);
    setStage("");
    operation.current = null;
    setMessage(
      `${successes} ${successes === 1 ? "source" : "sources"} saved.${controller.signal.aborted ? " Remaining uploads canceled." : ""}`,
    );
  }
  return (
    <main className="source-library">
      <div className="library-heading">
        <h1>
          Sources <span className="small-tag">{sources.length} uploaded</span>
        </h1>
        <button
          className="primary"
          disabled={!local || busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={16} />
          Upload sources
        </button>
      </div>
      <input
        ref={input}
        className="sr-only"
        type="file"
        aria-label="Choose source files"
        accept=".pdf,.docx,.txt"
        multiple
        disabled={!local || busy}
        onChange={(event) => {
          void upload(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <p className="source-storage-note">
        {local
          ? "Sources are stored only in this browser on this device. Keep your original files; clearing browser data removes this library."
          : "Source uploads currently support browser drafts only. Authenticated cloud source storage is not connected yet."}
      </p>
      {storageError && (
        <p className="error-text" role="alert">
          {storageError}
        </p>
      )}
      {errors.length > 0 && (
        <div className="source-errors" role="alert">
          <strong>Some files could not be added</strong>
          <ul>
            {errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <p>Choose the file again to retry.</p>
        </div>
      )}
      {busy && (
        <div className="upload-status" role="status">
          <span>{stage}</span>
          <button
            className="secondary"
            onClick={() => operation.current?.abort()}
          >
            Cancel uploads
          </button>
        </div>
      )}
      {!busy && message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="library-grid">
        <section className="source-list" aria-label="Uploaded sources">
          <button
            className="source-dropzone"
            disabled={!local || busy}
            onClick={() => input.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void upload(Array.from(event.dataTransfer.files));
            }}
          >
            <Upload size={22} />
            <strong>Choose files or drop them here</strong>
            <span>PDF, DOCX, TXT · 25 MB per file · PDFs up to 300 pages</span>
          </button>
          {!sources.length ? (
            <div className="library-empty">
              <Otto pose="searching" />
              <h2>Build a library for your question.</h2>
              <p>
                Add your sources to read the original PDF and explore extracted
                text. AI summaries are not connected yet.
              </p>
              <button className="secondary" onClick={() => onReader()}>
                Open evidence viewer
              </button>
            </div>
          ) : (
            <ul className="source-rows">
              {sources.map((source) => (
                <li
                  key={source.id}
                  className={detail?.id === source.id ? "selected" : ""}
                >
                  <button
                    className="source-select"
                    onClick={() => setSelected(source.id)}
                    aria-pressed={detail?.id === source.id}
                  >
                    <FileText size={24} />
                    <span>
                      <strong>{source.filename}</strong>
                      <small>
                        {source.format.toUpperCase()} ·{" "}
                        {(source.size / 1024).toFixed(0)} KB · {source.count}{" "}
                        {locatorLabel(
                          source.format,
                          source.count !== 1,
                        ).toLowerCase()}
                      </small>
                      <span className="source-ready">
                        {source.warning
                          ? "Ready · read warning"
                          : "Ready to read"}
                      </span>
                    </span>
                  </button>
                  <button
                    className="secondary"
                    onClick={() => onReader(source.id)}
                  >
                    Open
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${source.filename}`}
                    disabled={busy}
                    onClick={() => setRemoving(source.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                  {removing === source.id && (
                    <div
                      className="source-delete-confirm"
                      role="group"
                      aria-label={`Confirm deletion of ${source.filename}`}
                    >
                      <p>
                        Remove this source, its stored file, and extracted text
                        from this browser? Your manuscript stays unchanged.
                      </p>
                      <button
                        className="secondary"
                        onClick={() => setRemoving(undefined)}
                      >
                        Keep source
                      </button>
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await deleteSource(projectId, source.id);
                            setRemoving(undefined);
                            setMessage("Source and extracted text removed.");
                          } catch (error) {
                            setErrors([
                              error instanceof Error
                                ? error.message
                                : "Deletion failed.",
                            ]);
                          }
                        }}
                      >
                        Delete source
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="summary-empty">
          <span className="eyebrow">SOURCE DETAILS</span>
          <h2>{detail?.filename || "Read with purpose."}</h2>
          {detail ? (
            <>
              <dl className="summary-fields">
                <div>
                  <dt>Format</dt>
                  <dd>{detail.format.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>Locations</dt>
                  <dd>
                    {detail.count} extracted{" "}
                    {locatorLabel(detail.format, true).toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>This browser only</dd>
                </div>
              </dl>
              {detail.warning && (
                <p className="source-warning">{detail.warning}</p>
              )}
              <button className="primary" onClick={() => onReader(detail.id)}>
                <BookOpen size={16} />
                Read source
              </button>
            </>
          ) : (
            <p>
              Select a source to see its details, extraction warnings, and text.
            </p>
          )}
          <div className="source-ai-note">
            <strong>AI summaries are not connected.</strong>
            <p>
              Uploading a file extracts its text; it does not generate findings
              or evaluate your thesis.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
