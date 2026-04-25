import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";

type SetCookie = { name: string; value: string; options: CookieOptions };

/**
 * Server Components, Route Handlers, and Server Actions — use the caller's session cookies.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY).");
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: SetCookie[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — session refresh is handled in middleware.
          }
        },
      },
    }
  );
}
