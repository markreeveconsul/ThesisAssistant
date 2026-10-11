import { redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { getSupabaseConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { Project, Section } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  if (!getSupabaseConfig())
    return <Workspace preview projects={[]} sections={[]} />;
  const client = await createClient();
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || !user) redirect("/auth");
  const { data, error } = await client
    .from("projects")
    .select("id,title,citation_style")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error)
    throw new Error(
      "Could not load projects. Check the database migrations and connection.",
    );
  const projects = (data ?? []) as Project[];
  const query = await searchParams;
  const project =
    projects.find((item) => item.id === query.project) ?? projects[0];
  let sections: Section[] = [];
  if (project) {
    const result = await client
      .from("sections")
      .select("id,title,position,content,project_id,parent_id")
      .eq("project_id", project.id)
      .order("position");
    if (result.error)
      throw new Error("Could not load the outline. Please try again.");
    sections = (result.data ?? []) as Section[];
  }
  return (
    <Workspace
      key={project?.id ?? "empty"}
      preview={false}
      projects={projects}
      activeProject={project}
      sections={sections}
      email={user.email}
    />
  );
}
