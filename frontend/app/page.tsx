import { redirect } from "next/navigation";
import { Dashboard } from "@/components/Dashboard";
import { getSupabaseConfig, requireBrowserDraftMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/lib/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (!getSupabaseConfig()) {
    requireBrowserDraftMode();
    return <Dashboard local projects={[]} />;
  }
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/auth");
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error("Could not load projects.");
  return <Dashboard local={false} projects={(data ?? []) as Project[]} />;
}
