"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createProject } from "@/app/project-actions";
import { createLocal } from "@/lib/local-workspace";
import { projectSchema } from "@/lib/validation";
export function ProjectForm({ local }: { local: boolean }) {
  const [state, action, pending] = useActionState(createProject, {});
  const [localError, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="stack project-form"
      action={local ? undefined : action}
      onSubmit={
        local
          ? async (event) => {
              event.preventDefault();
              setError("");
              setBusy(true);
              try {
                const parsed = projectSchema.parse(
                  Object.fromEntries(new FormData(event.currentTarget)),
                );
                const project = await createLocal(parsed);
                router.push("/project/" + project.id);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Could not create the draft.",
                );
                setBusy(false);
              }
            }
          : undefined
      }
    >
      <span className="eyebrow">NEW THESIS</span>
      <h2>Start with your research problem</h2>
      <label>
        Working title
        <input
          name="title"
          placeholder="e.g. Social media use and academic performance"
          required
          maxLength={160}
        />
      </label>
      <label>
        Research problem
        <textarea
          name="research_problem"
          rows={4}
          maxLength={4000}
          placeholder="What question does your study answer?"
        />
      </label>
      <p className="field-help">
        Keep your study’s question close while you write. You can refine it
        later.
      </p>
      <div className="form-columns">
        <label>
          Citation style
          <select name="citation_style">
            <option value="apa">APA 7</option>
            <option value="mla">MLA 9</option>
            <option value="ieee">IEEE</option>
          </select>
        </label>
        <label>
          Structure
          <select name="structure">
            <option value="five-chapter">Five-chapter thesis</option>
            <option value="blank">Blank outline</option>
          </select>
        </label>
      </div>
      {(state.error || localError) && (
        <p role="alert" className="error-text">
          {state.error || localError}
        </p>
      )}
      <button className="primary" disabled={pending || busy}>
        <Plus size={17} />
        {pending || busy ? "Creating…" : "Create thesis"}
      </button>
      {local && (
        <p className="field-help">
          Saved only in this browser until cloud setup. Download backups of
          important drafts.
        </p>
      )}
    </form>
  );
}
