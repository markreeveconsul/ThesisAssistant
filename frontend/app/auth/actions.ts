"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/config";
import { credentialsSchema } from "@/lib/validation";

export type AuthState = { error?: string; message?: string };
export async function authenticate(
  _: AuthState,
  data: FormData,
): Promise<AuthState> {
  if (!getSupabaseConfig())
    return { error: "Account access will be available after Supabase setup." };
  const mode = data.get("mode");
  if (!["login", "signup", "reset", "update"].includes(String(mode)))
    return { error: "Unknown request." };
  const client = await createClient();
  if (mode === "reset") {
    const email = z.string().email().safeParse(data.get("email"));
    if (!email.success) return { error: "Enter a valid email address." };
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!site)
      return { error: "Password recovery needs a configured site URL." };
    const { error } = await client.auth.resetPasswordForEmail(email.data, {
      redirectTo: site + "/auth/callback?next=/auth/update-password",
    });
    return error
      ? {
          error:
            "We could not send the recovery email. Please try again later.",
        }
      : {
          message:
            "If that account exists, you’ll receive a password reset email.",
        };
  }
  if (mode === "update") {
    const password = credentialsSchema.shape.password.safeParse(
      data.get("password"),
    );
    if (!password.success)
      return { error: "Use a password between 12 and 128 characters." };
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return { error: "Your recovery link expired. Request a new one." };
    const { error } = await client.auth.updateUser({ password: password.data });
    if (error)
      return {
        error:
          "Could not update your password. Please try a new recovery link.",
      };
    redirect("/");
  }
  const schema =
    mode === "login"
      ? credentialsSchema.extend({ password: z.string().min(1).max(128) })
      : credentialsSchema;
  const parsed = schema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (mode === "signup") {
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (!site) return { error: "Signup needs a configured site URL." };
    const { data: result, error } = await client.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: site + "/auth/callback" },
    });
    if (error)
      return {
        error: "Unable to create an account. Please try again or sign in.",
      };
    if (!result.session)
      return {
        message: "Check your email to confirm your account, then sign in.",
      };
  } else {
    const { error } = await client.auth.signInWithPassword(parsed.data);
    if (error)
      return {
        error: "Could not sign in. Check your details and email confirmation.",
      };
  }
  redirect("/");
}
export async function signOut() {
  const client = await createClient();
  await client.auth.signOut();
  redirect("/auth");
}
