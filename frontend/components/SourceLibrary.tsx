"use client";
import { ArrowLeft, BookOpen, FileText, Upload } from "lucide-react";
export function SourceLibrary({
  onBack,
  onNotice,
}: {
  onBack: () => void;
  onNotice: () => void;
}) {
  return (
    <main className="source-library">
      <button className="quiet-button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to editor
      </button>
      <div className="library-heading">
        <div>
          <span className="eyebrow">YOUR EVIDENCE</span>
          <h1>
            Sources <span className="small-tag">0 uploaded</span>
          </h1>
        </div>
        <button className="primary" onClick={onNotice}>
          <Upload size={16} />
          Upload PDF
        </button>
      </div>
      <div className="library-grid">
        <section className="library-empty">
          <BookOpen size={38} strokeWidth={1} />
          <h2>Build a library for your question.</h2>
          <p>
            Source upload and processing will connect in Milestone 3. Your
            papers will appear here with their real processing status.
          </p>
        </section>
        <aside className="summary-empty">
          <FileText size={26} />
          <h2>Read with purpose.</h2>
          <p>
            Select a processed paper to see its objective, method, findings,
            limitations, and possible relevance to your study.
          </p>
          <p>Each summary will link back to evidence in the original file.</p>
        </aside>
      </div>
    </main>
  );
}
