import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type SetCookie = { name: string; value: string; options: CookieOptions };

function safePath(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("://")) return fallback;
  return next;
}

export async function GET(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  ) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=not_configured", request.url)
    );
  }

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safePath(searchParams.get("next"), "/dilution-monitor");

  if (!code) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=missing_code", request.url)
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
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
            /* RSC or missing Response context */
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange", error);
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=exchange", request.url)
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
