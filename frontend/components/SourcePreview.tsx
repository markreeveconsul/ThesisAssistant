"use client";

import { useEffect, useState } from "react";
import { apiFetch, Citation, locatorLabel, sourceBlob } from "@/lib/api";

type Location = { filename: string; number: number; locator_type: string; text: string };

export default function SourcePreview({ projectId, citation, onClose }: { projectId: string; citation: Citation; onClose: () => void }) {
  const [location, setLocation] = useState<Location | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let url = "";
    setLocation(null); setPdfUrl(""); setError("");
    const load = async () => {
      if (!citation.file_id) throw new Error("This older citation has no file identifier. Ask the question again to create a linked citation.");
      const value = await apiFetch<Location>(`/api/v1/projects/${projectId}/files/${citation.file_id}/locator/${citation.page}`);
      if (active) setLocation(value);
      if (value.locator_type === "page") {
        url = URL.createObjectURL(await sourceBlob(projectId, citation.file_id));
        if (active) setPdfUrl(url);
        else URL.revokeObjectURL(url);
      }
    };
    void load().catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : "Source unavailable"); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [projectId, citation]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="preview-backdrop" onClick={onClose}>
    <section className="source-preview" role="dialog" aria-modal="true" aria-label="Source preview" onClick={(event) => event.stopPropagation()}>
      <header><h2>{citation.filename} — {locatorLabel(citation)}</h2><button autoFocus onClick={onClose} aria-label="Close source preview">Close</button></header>
      {error && <p role="alert">{error}</p>}
      {!location && !error && <p>Loading source…</p>}
      {pdfUrl && <iframe title="Cited PDF page" src={`${pdfUrl}#page=${citation.page}`} />}
      {location && <details open={!pdfUrl}><summary>Extracted source text</summary><pre>{location.text || "No extractable text on this page."}</pre></details>}
    </section>
  </div>;
}
