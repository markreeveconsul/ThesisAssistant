import { AuthForm } from "@/components/AuthForm";
import { getSupabaseConfig } from "@/lib/config";
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthForm
      configured={!!getSupabaseConfig()}
      linkError={params.error === "link"}
    />
  );
}
