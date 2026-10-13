"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

export function PdfPage({
  blob,
  number,
  zoom,
  filename,
}: {
  blob: Blob;
  number: number;
  zoom: number;
  filename: string;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(160, entries[0].contentRect.width)),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let canceled = false;
    let destroy: (() => Promise<void>) | undefined;
    setDocument(undefined);
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (canceled) return;
        const task = pdfjs.getDocument({
          data,
          useSystemFonts: true,
        });
        destroy = () => task.destroy();
        const pdf = await task.promise;
        if (!canceled) setDocument(pdf);
      } catch {
        if (!canceled) {
          setError(
            "The PDF preview could not be loaded. You can still read the extracted text or download the original.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      canceled = true;
      void destroy?.();
    };
  }, [blob]);
  useEffect(() => {
    if (!document || !container.current) return;
    let canceled = false,
      task: RenderTask | undefined;
    const canvas = window.document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${filename}, page ${number}`);
    container.current.appendChild(canvas);
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const page = await document.getPage(number);
        if (canceled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * zoom;
        const ratio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(12_000_000 / (base.width * base.height * scale * scale)),
        );
        const viewport = page.getViewport({ scale: scale * ratio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${base.width * scale}px`;
        canvas.style.height = `${base.height * scale}px`;
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!canceled) setLoading(false);
      } catch {
        if (!canceled) {
          setError(
            "This page could not be rendered. Read the extracted text or download the original.",
          );
          setLoading(false);
        }
      }
    })();
    return () => {
      canceled = true;
      task?.cancel();
      canvas.remove();
    };
  }, [document, number, zoom, width, filename]);
  return (
    <div
      className="pdf-preview"
      tabIndex={0}
      role="region"
      aria-label="Scrollable PDF page"
    >
      <div ref={container} className="pdf-canvas" />
      {loading && <p role="status">Rendering page {number}…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
