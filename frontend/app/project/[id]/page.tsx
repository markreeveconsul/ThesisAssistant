import { notFound, redirect } from "next/navigation";
import { Workspace } from "@/components/Workspace";
import { getSupabaseConfig, requireBrowserDraftMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { Project, Section } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  if (!getSupabaseConfig()) {
    requireBrowserDraftMode();
    return <Workspace local projectId={id} sections={[]} />;
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/auth");
  const { data: project, error } = await client
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load the project.");
  if (!project) notFound();
  const result = await client
    .from("sections")
    .select("*")
    .eq("project_id", id)
    .order("position");
  if (result.error) throw new Error("Could not load chapters.");
  return (
    <Workspace
      local={false}
      projectId={id}
      initialProject={project as Project}
      sections={(result.data ?? []) as Section[]}
    />
  );
}
