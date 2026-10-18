"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/config";

let browserClient: SupabaseClient | undefined;

export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  browserClient ??= createBrowserClient(config.url, config.key);
  return browserClient;
}
