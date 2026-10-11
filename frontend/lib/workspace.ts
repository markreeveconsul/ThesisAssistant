export type Project = {
  id: string;
  title: string;
  citation_style: "apa" | "mla" | "ieee";
};
export type Section = {
  id: string;
  title: string;
  position: number;
  content: Record<string, unknown>;
  project_id: string;
  parent_id: string | null;
};
export type ProjectState = { error?: string };
