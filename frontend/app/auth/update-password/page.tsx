import { AuthForm } from "@/components/AuthForm";
import { getSupabaseConfig } from "@/lib/config";
export default function UpdatePasswordPage() {
  return <AuthForm configured={!!getSupabaseConfig()} recovery />;
}
