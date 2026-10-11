"use client";
import { useState } from "react";
import type { Project } from "@/lib/workspace";
import { updateLocalProblem } from "@/lib/local-workspace";
import { updateResearchProblem } from "@/app/editor-actions";
export function ResearchProblem({
  project,
  local,
  onSaved,
}: {
  project: Project;
  local: boolean;
  onSaved: (project: Project) => void;
}) {
  const [value, setValue] = useState(project.research_problem ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="research-problem">
      <summary>
        <span>Research problem</span>
        <span>
          {project.research_problem ||
            "Add the question that guides your study"}
        </span>
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (local)
              onSaved(
                await updateLocalProblem(
                  project.id,
                  value,
                  project.revision ?? 0,
                ),
              );
            else {
              const result = await updateResearchProblem(
                project.id,
                value,
                project.revision ?? 0,
              );
              if (result.error) throw new Error(result.error);
              if (result.project) onSaved(result.project);
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Research problem
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={4000}
            rows={3}
          />
        </label>
        <button className="secondary" disabled={busy}>
          {busy ? "Saving…" : "Save research problem"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
