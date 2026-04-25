import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY).");
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
