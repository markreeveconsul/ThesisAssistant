"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectSchema } from "@/lib/validation";
import type { ProjectState } from "@/lib/workspace";
export async function createProject(
  _: ProjectState,
  data: FormData,
): Promise<ProjectState> {
  const parsed = projectSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { data: project, error } = await client
    .from("projects")
    .insert({ ...parsed.data, owner_id: user.id })
    .select("id")
    .single();
  if (error)
    return { error: "Your project could not be created. Please try again." };
  revalidatePath("/");
  redirect("/?project=" + project.id);
}
