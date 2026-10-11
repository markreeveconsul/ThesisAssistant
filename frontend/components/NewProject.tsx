"use client";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { createProject } from "@/app/project-actions";
export function NewProject({
  preview,
  onPreviewCreate,
}: {
  preview: boolean;
  onPreviewCreate: (name: string) => void;
}) {
  const [state, action, pending] = useActionState(createProject, {});
  return (
    <form
      action={preview ? undefined : action}
      onSubmit={
        preview
          ? (event) => {
              event.preventDefault();
              const title = String(
                new FormData(event.currentTarget).get("title") ?? "",
              ).trim();
              if (title) onPreviewCreate(title);
            }
          : undefined
      }
      className="stack"
    >
      <label>
        Project title
        <input
          autoFocus
          name="title"
          required
          maxLength={160}
          placeholder="e.g. Learning through feedback"
        />
      </label>
      <label>
        Citation style
        <select name="citation_style" defaultValue="apa">
          <option value="apa">APA 7th edition</option>
          <option value="mla">MLA 9th edition</option>
          <option value="ieee">IEEE</option>
        </select>
      </label>
      <p className="muted">
        {preview
          ? "This creates a temporary layout preview. It is not saved and will reset when you reload."
          : "Your new project is private to your account."}
      </p>
      {state.error && (
        <p role="alert" className="error-text">
          {state.error}
        </p>
      )}
      <button className="primary" disabled={pending}>
        {pending
          ? "Creating…"
          : preview
            ? "Create preview project"
            : "Create project"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
