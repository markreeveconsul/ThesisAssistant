import type { Project, Section } from "./workspace";
import { chapterTitles, emptyDocument, validateDocument } from "./document";

export const LOCAL_KEY = "thesisdesk-drafts-v1";
type LocalData = { version: 1; projects: Project[]; sections: Section[] };
export type SaveResult = {
  section?: Section;
  error?: string;
  conflict?: boolean;
};
export function readLocal(): LocalData {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return { version: 1, projects: [], sections: [] };
  const data = JSON.parse(raw) as LocalData;
  if (
    data.version !== 1 ||
    !Array.isArray(data.projects) ||
    !Array.isArray(data.sections) ||
    !data.sections.every((section) => validateDocument(section.content))
  )
    throw new Error(
      "Browser drafts could not be read. Export a backup before clearing browser storage.",
    );
  return data;
}
function writeLocal(data: LocalData) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  window.dispatchEvent(new Event("thesisdesk-local-change"));
}
async function locked<T>(action: () => T): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      "Safe browser draft saving requires a browser with Web Locks support.",
    );
  return navigator.locks.request(LOCAL_KEY, action);
}
export async function createLocal(
  project: Omit<Project, "id">,
): Promise<Project> {
  return locked(() => {
    const data = readLocal();
    const created = {
      ...project,
      id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
      revision: 0,
    };
    data.projects.unshift(created);
    if (project.structure === "five-chapter")
      chapterTitles.forEach((title, position) =>
        data.sections.push({
          id: crypto.randomUUID(),
          project_id: created.id,
          title,
          position,
          parent_id: null,
          revision: 0,
          content: structuredClone(emptyDocument),
        }),
      );
    writeLocal(data);
    return created;
  });
}
export async function saveLocal(
  section: Section,
  expected: number,
): Promise<SaveResult> {
  return locked(() => {
    const data = readLocal(),
      index = data.sections.findIndex(
        (item) =>
          item.id === section.id && item.project_id === section.project_id,
      );
    if (index < 0)
      return { error: "This chapter no longer exists.", conflict: true };
    if (data.sections[index].revision !== expected)
      return {
        error:
          "This chapter changed in another tab. Your draft is kept here; reload the latest version or download your draft.",
        conflict: true,
      };
    if (!validateDocument(section.content))
      return { error: "This chapter is invalid or too large." };
    const next = { ...section, revision: expected + 1 };
    data.sections[index] = next;
    const project = data.projects.find(
      (item) => item.id === section.project_id,
    );
    if (project) project.updated_at = new Date().toISOString();
    writeLocal(data);
    return { section: next };
  });
}
export async function addLocalChapter(
  projectId: string,
  title: string,
): Promise<Section> {
  return locked(() => {
    const data = readLocal();
    if (!data.projects.some((item) => item.id === projectId))
      throw new Error("Project unavailable.");
    const position =
      Math.max(
        -1,
        ...data.sections
          .filter((item) => item.project_id === projectId)
          .map((item) => item.position),
      ) + 1;
    const section: Section = {
      id: crypto.randomUUID(),
      project_id: projectId,
      title,
      position,
      parent_id: null,
      revision: 0,
      content: structuredClone(emptyDocument),
    };
    data.sections.push(section);
    writeLocal(data);
    return section;
  });
}
export async function updateLocalProblem(
  projectId: string,
  problem: string,
  revision: number,
) {
  return locked(() => {
    const data = readLocal(),
      project = data.projects.find((item) => item.id === projectId);
    if (!project || (project.revision ?? 0) !== revision)
      throw new Error(
        "Project changed in another tab. Reload before updating the research problem.",
      );
    project.research_problem = problem;
    project.revision = revision + 1;
    project.updated_at = new Date().toISOString();
    writeLocal(data);
    return project;
  });
}
export async function reorderLocal(projectId: string, ordered: Section[]) {
  return locked(() => {
    const data = readLocal(),
      current = data.sections.filter((item) => item.project_id === projectId);
    if (
      current.length !== ordered.length ||
      new Set(ordered.map((item) => item.id)).size !== current.length ||
      ordered.some(
        (item) =>
          !current.some(
            (existing) =>
              existing.id === item.id && existing.revision === item.revision,
          ),
      )
    )
      throw new Error(
        "Chapters changed in another tab. Reload before reordering.",
      );
    const updated = ordered.map((item, position) => ({
      ...item,
      position,
      revision: item.revision + 1,
    }));
    data.sections = data.sections
      .filter((item) => item.project_id !== projectId)
      .concat(updated);
    writeLocal(data);
    return updated;
  });
}
