"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { ArrowUp, PanelRight, X } from "lucide-react";

export function AssistantPanel({
  open,
  docked,
  onOpenChange,
  onDockChange,
  onSources,
  onUnavailable,
}: {
  open: boolean;
  docked: boolean;
  onOpenChange: (open: boolean) => void;
  onDockChange: (docked: boolean) => void;
  onSources: () => void;
  onUnavailable: (feature: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) close.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open, onOpenChange]);
  return (
    <>
      <button
        ref={trigger}
        className="otto-trigger"
        aria-label="Open Otto assistant"
        aria-expanded={open}
        aria-controls="otto-panel"
        hidden={open}
        onClick={() => onOpenChange(true)}
        title="Open Otto (Ctrl/⌘ K)"
      >
        <Image src="/otto/otto-head-512.png" width={132} height={132} alt="" />
      </button>
      {open && (
        <section
          id="otto-panel"
          className={"otto-panel" + (docked ? " docked" : "")}
          role="dialog"
          aria-label="Otto assistant"
        >
          <header className="otto-heading">
            <Image
              src="/otto/otto-head-512.png"
              width={40}
              height={40}
              alt=""
            />
            <div>
              <strong>Otto</strong>
              <span className="otto-status">Not connected</span>
            </div>
            <button
              className="quiet-button"
              aria-pressed={docked}
              onClick={() => onDockChange(!docked)}
            >
              <PanelRight size={15} />
              {docked ? "Float" : "Dock"}
            </button>
            <button
              ref={close}
              className="icon-button"
              aria-label="Close Otto"
              onClick={() => onOpenChange(false)}
            >
              <X size={18} />
            </button>
          </header>
          <div className="otto-log">
            <p className="otto-message">
              Hi, I’m Otto. This will be your space to explore sources and
              review your writing.
            </p>
            <div className="otto-availability">
              <strong>Your assistant is not connected yet.</strong>
              <p>
                You can upload and read sources in the library. AI chat and
                source review are not connected yet.
              </p>
              <button className="text-button" onClick={onSources}>
                View source library →
              </button>
            </div>
          </div>
          <footer className="otto-footer">
            <div className="otto-prompts">
              {["Summarize", "Find evidence", "Review RRL"].map((label) => (
                <button key={label} onClick={() => onUnavailable(label)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="otto-compose">
              <input
                aria-label="Ask Otto"
                placeholder="Ask about your sources…"
                disabled
              />
              <button disabled aria-label="Send question">
                <ArrowUp size={18} />
              </button>
            </div>
            <p>AI connection required · Your writing stays yours.</p>
          </footer>
        </section>
      )}
    </>
  );
}
