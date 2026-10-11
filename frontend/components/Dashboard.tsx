"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, FileText, ArrowRight } from "lucide-react";
import type { Project } from "@/lib/workspace";
import { readLocal } from "@/lib/local-workspace";
import { ProjectForm } from "./ProjectForm";
import { ThemeButton } from "./ThemeButton";
import { signOut } from "@/app/auth/actions";
export function Dashboard({
  local,
  projects,
}: {
  local: boolean;
  projects: Project[];
}) {
  const [items, setItems] = useState(projects),
    [error, setError] = useState("");
  useEffect(() => {
    if (!local) return;
    const refresh = () => {
      try {
        setItems(readLocal().projects);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not read browser drafts.",
        );
      }
    };
    refresh();
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [local]);
  return (
    <div className="dashboard">
      <header className="topbar">
        <Link href="/" className="wordmark">
          <BookOpen size={24} />
          ThesisDesk
        </Link>
        <div className="top-actions">
          <span className="small-tag">
            {local ? "BROWSER DRAFTS" : "PRIVATE WORKSPACE"}
          </span>
          <ThemeButton />
          {local ? (
            <Link href="/auth" className="secondary">
              Account setup
            </Link>
          ) : (
            <form action={signOut}>
              <button className="secondary">Log out</button>
            </form>
          )}
        </div>
      </header>
      <main className="dashboard-main">
        <div className="dashboard-title">
          <span className="eyebrow">YOUR RESEARCH. YOUR WORDS.</span>
          <h1>Your theses</h1>
          <p>Start something new or pick up where you left off.</p>
        </div>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="dashboard-grid">
          <ProjectForm local={local} />
          <section className="recent-projects" aria-label="Recent theses">
            <span className="eyebrow">CONTINUE WRITING</span>
            {items.length ? (
              items.map((project) => (
                <Link
                  className="project-card"
                  href={"/project/" + project.id}
                  key={project.id}
                >
                  <span className="project-cover">
                    <FileText size={30} strokeWidth={1} />
                  </span>
                  <div>
                    <h2>{project.title}</h2>
                    <p>
                      {project.research_problem ||
                        "Your next question begins here."}
                    </p>
                    <small>
                      {project.citation_style.toUpperCase()} ·{" "}
                      {local ? "Browser draft" : "Cloud project"}
                    </small>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              ))
            ) : (
              <div className="dashboard-empty">
                <BookOpen size={35} strokeWidth={1} />
                <h2>Room for your next idea.</h2>
                <p>
                  Create your first thesis. Your chapters, research question,
                  and sources will stay together.
                </p>
              </div>
            )}
            {local && (
              <aside className="local-notice">
                <strong>A working draft, on this device.</strong>
                <p>
                  The editor works now. Account sync and online backup will
                  become available after Supabase setup. Browser drafts are not
                  a private account or a cloud backup.
                </p>
              </aside>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
