"use client";
import { Otto } from "./Otto";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowRight,
  ArrowUp,
  FileText,
  MessageSquare,
  PanelRightClose,
  ShieldCheck,
} from "lucide-react";
export function AssistantPanel({
  panelWidth,
  setPanelWidth,
  onHide,
  onSources,
  onUnavailable,
}: {
  panelWidth: number;
  setPanelWidth: Dispatch<SetStateAction<number>>;
  onHide: () => void;
  onSources: () => void;
  onUnavailable: (feature: string) => void;
}) {
  const [context, setContext] = useState("sources");
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  return (
    <aside className="assistant-panel" aria-label="Research assistant">
      <div
        className="panel-resize"
        role="separator"
        aria-label="Resize assistant"
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={480}
        aria-valuenow={panelWidth}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setPanelWidth((width) =>
              Math.max(
                280,
                Math.min(480, width + (event.key === "ArrowLeft" ? 20 : -20)),
              ),
            );
          }
        }}
        onPointerDown={(event) => {
          resizeStart.current = { x: event.clientX, width: panelWidth };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (resizeStart.current)
            setPanelWidth(
              Math.max(
                280,
                Math.min(
                  480,
                  resizeStart.current.width +
                    resizeStart.current.x -
                    event.clientX,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          resizeStart.current = null;
        }}
        onPointerCancel={() => {
          resizeStart.current = null;
        }}
      />
      <div className="assistant-heading">
        <div>
          <MessageSquare size={17} />
          <strong>Research assistant</strong>
        </div>
        <button
          className="icon-button"
          aria-label="Hide assistant"
          onClick={() => onHide()}
        >
          <PanelRightClose size={17} />
        </button>
      </div>
      <div className="context-row">
        <span className="status-dot" />
        <label htmlFor="assistant-context">Context</label>
        <select
          id="assistant-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
        >
          <option value="sources">Project sources</option>
          <option value="section">Current section + sources</option>
        </select>
      </div>
      <div className="assistant-body">
        <Otto pose="reading" />
        <span className="eyebrow">THINK WITH YOUR SOURCES</span>
        <h2>
          A second perspective.
          <br />
          Grounded in your reading.
        </h2>
        <p>
          Bring your papers alongside your writing. Ask questions, trace
          evidence, and make connections.
        </p>
        <div className="source-drop">
          <FileText size={23} strokeWidth={1.4} />
          <strong>Your source library starts here</strong>
          <span>PDF upload arrives in Milestone 3.</span>
          <button
            className="secondary"
            onClick={() => {
              onSources();
              onUnavailable("Source upload");
            }}
          >
            View source library
            <ArrowRight size={14} />
          </button>
        </div>
        <span className="section-label questions-label">
          WAYS TO WORK TOGETHER
        </span>
        {[
          "Compare findings across my papers",
          "Find support for a claim",
          "Review the structure of my RRL",
        ].map((text, i) => (
          <button
            key={text}
            className="question-card"
            onClick={() =>
              onUnavailable(i === 2 ? "RRL review" : "Source-grounded chat")
            }
          >
            <span>0{i + 1}</span>
            {text}
            <ArrowRight size={14} />
          </button>
        ))}
        <p className="integrity-note">
          <ShieldCheck size={15} />
          <span>
            You make the decisions.
            <br />
            AI suggestions will always need your approval.
          </span>
        </p>
      </div>
      <div className="assistant-composer">
        <div className="composer-box">
          <textarea
            aria-label="Ask your sources"
            placeholder="Ask a question about your sources…"
            disabled
          />
          <div>
            <span>Assistant connects in Milestone 4</span>
            <button disabled aria-label="Send question">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
        <p>Evidence first. Your voice, always.</p>
      </div>
    </aside>
  );
}
