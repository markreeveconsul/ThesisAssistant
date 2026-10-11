"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { documentSchema, emptyDocument } from "@/lib/document";
import type { Project, Section } from "@/lib/workspace";
import type { SaveResult } from "@/lib/local-workspace";

const sectionSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  content: documentSchema,
  revision: z.number().int().nonnegative(),
});
export async function saveChapter(input: unknown): Promise<SaveResult> {
  const parsed = sectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const section = parsed.data,
    client = await createClient();
  const { data, error } = await client
    .from("sections")
    .update({
      title: section.title,
      content: section.content,
      revision: section.revision + 1,
    })
    .eq("id", section.id)
    .eq("project_id", section.project_id)
    .eq("revision", section.revision)
    .select("*")
    .maybeSingle();
  if (error)
    return {
      error:
        error.code === "40001"
          ? "This chapter changed elsewhere. Download your draft before reloading."
          : "Could not save. Check your connection and sign-in.",
      conflict: error.code === "40001",
    };
  if (!data)
    return {
      error:
        "This chapter changed elsewhere or is no longer accessible. Your draft has not been overwritten.",
      conflict: true,
    };
  return { section: data as Section };
}
export async function addChapter(
  projectId: string,
  title: string,
): Promise<{ section?: Section; error?: string }> {
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !title.trim() ||
    title.trim().length > 160
  )
    return { error: "Enter a chapter title of 1–160 characters." };
  const client = await createClient();
  const { data: project } = await client
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();
  if (!project) return { error: "Project unavailable. Please sign in again." };
  const { data: sections, error: readError } = await client
    .from("sections")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  if (readError) return { error: "Could not load chapter order." };
  const { data, error } = await client
    .from("sections")
    .insert({
      project_id: projectId,
      title: title.trim(),
      position: (sections?.[0]?.position ?? -1) + 1,
      content: emptyDocument,
    })
    .select("*")
    .single();
  return error
    ? { error: "Could not create the chapter." }
    : { section: data as Section };
}
export async function updateResearchProblem(
  projectId: string,
  problem: string,
  revision: number,
): Promise<{ project?: Project; error?: string }> {
  if (
    !z.string().uuid().safeParse(projectId).success ||
    problem.length > 4000 ||
    !Number.isInteger(revision) ||
    revision < 0
  )
    return { error: "Invalid research problem." };
  const client = await createClient();
  const { data, error } = await client
    .from("projects")
    .update({ research_problem: problem.trim(), revision: revision + 1 })
    .eq("id", projectId)
    .eq("revision", revision)
    .select("*")
    .maybeSingle();
  return error || !data
    ? {
        error:
          "The project changed or could not be saved. Reload before trying again.",
      }
    : { project: data as Project };
}
export async function reorderChapters(
  projectId: string,
  sections: { id: string; revision: number }[],
) {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      sections: z
        .array(
          z.object({
            id: z.string().uuid(),
            revision: z.number().int().nonnegative(),
          }),
        )
        .max(200),
    })
    .safeParse({ projectId, sections });
  if (!parsed.success) return { error: "Invalid chapter order." };
  const client = await createClient();
  const { error } = await client.rpc("reorder_chapters", {
    p_project: projectId,
    p_sections: sections,
  });
  return error
    ? {
        error:
          "Chapters changed or could not be reordered. Reload before trying again.",
      }
    : {};
}
