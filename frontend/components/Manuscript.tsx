import { BookOpen, Plus } from "lucide-react";
import type { Project } from "@/lib/workspace";
import { sampleChapters } from "@/lib/sample-manuscript";
export function Manuscript({
  sample,
  chapter,
  activeProject,
  projectTitle,
  preview,
  onNewProject,
}: {
  sample: boolean;
  chapter: string;
  activeProject?: Project;
  projectTitle: string;
  preview: boolean;
  onNewProject: () => void;
}) {
  return sample ? (
    <article className="document-paper">
      <div className="paper-running-head">
        <span>LEARNING THROUGH FEEDBACK</span>
        <span>
          CHAPTER {String(sampleChapters.indexOf(chapter) + 1).padStart(2, "0")}
        </span>
      </div>
      <span className="chapter-kicker">
        {String(sampleChapters.indexOf(chapter) + 1).padStart(2, "0")} / THE
        MANUSCRIPT
      </span>
      <h1>{chapter}</h1>
      <p className="document-deck">
        {chapter === "Literature review"
          ? "Connecting the ideas that shape this study."
          : "Every chapter begins with a question worth exploring."}
      </p>
      <div className="paper-line" />
      {chapter === "Literature review" ? (
        <>
          <h2 id="sample-section-0">
            <span>2.1</span> Research context
          </h2>
          <p>
            Feedback is part of everyday learning. A comment in the margin, a
            conversation after class, or a question from a peer can invite a
            student to look at their work differently.
          </p>
          <p>
            This chapter will examine how the literature describes that process:
            what students notice, how they interpret it, and what they choose to
            do next.
          </p>
          <aside className="writer-note">
            <span>NOTE TO SELF</span>Compare the studies by theme, rather than
            summarizing one paper at a time. Where do their findings agree—and
            where do they diverge?
          </aside>
          <h2 id="sample-section-1">
            <span>2.2</span> Student engagement
          </h2>
          <p>
            Begin by defining engagement in the context of this study. Separate
            the concepts used by different authors, and connect each definition
            to a source you have read.
          </p>
          <div className="draft-placeholder">
            <span className="margin-mark">→</span>
            <p>
              A space for your next connection.
              <br />
              <em>Your sources and assistant will be right beside you.</em>
            </p>
          </div>
          <h2 id="sample-section-2">
            <span>2.3</span> The role of feedback
          </h2>
          <p>
            Consider which conditions help learners turn feedback into action.
            Add evidence here once your source library is ready.
          </p>
          <h2 id="sample-section-3">
            <span>2.4</span> Research gap
          </h2>
          <p>
            Explain what remains unresolved in the studies you have reviewed,
            and how your question addresses that uncertainty.
          </p>
        </>
      ) : (
        <>
          <h2>Start with your argument</h2>
          <p>
            What should this chapter help your reader understand? Gather the
            questions, sources, and ideas you want to develop here.
          </p>
          <aside className="writer-note">
            <span>LAYOUT SAMPLE</span>This text illustrates the reading surface.
            Document editing and autosave will be added in Milestone 2.
          </aside>
        </>
      )}
      <footer className="paper-footer">
        <span>Illustrative writing · not a sourced research answer</span>
        <span>
          {String(sampleChapters.indexOf(chapter) + 1).padStart(2, "0")}
        </span>
      </footer>
    </article>
  ) : (
    <article className="document-paper empty-paper">
      <span className="chapter-kicker">A FRESH PAGE</span>
      <h1>
        {activeProject || projectTitle !== "Your thesis workspace"
          ? projectTitle
          : "Your ideas begin here."}
      </h1>
      <p className="document-deck">A place to give your research shape.</p>
      <div className="paper-line" />
      <BookOpen size={36} strokeWidth={1} />
      <h2>
        {activeProject ? "Your workspace is ready." : "Start with a project."}
      </h2>
      <p>
        {activeProject
          ? "Your project is saved. Chapter editing and autosave are the next milestone."
          : preview
            ? "This temporary project lets you explore the layout. Connect Supabase later to save your work."
            : "Create a private project for your thesis. Your chapters, sources, and notes will stay together."}
      </p>
      {!activeProject && (
        <button className="primary" onClick={() => onNewProject()}>
          <Plus size={16} />
          New project
        </button>
      )}
    </article>
  );
}
