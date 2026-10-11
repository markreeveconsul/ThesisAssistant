export type Project = {
  id: string;
  title: string;
  citation_style: "apa" | "mla" | "ieee";
  research_problem?: string;
  structure?: "five-chapter" | "blank";
  updated_at?: string;
  revision?: number;
};
export type Section = {
  id: string;
  title: string;
  position: number;
  content: Record<string, unknown>;
  project_id: string;
  parent_id: string | null;
  revision: number;
};
export type ProjectState = { error?: string };
