import { Suspense } from "react";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/isConfigured";
import LoginForm from "./LoginForm";

export default function AuthLoginPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0d1117] text-[#e6edf3] font-sans">
        <p className="text-sm text-[#8b949e] max-w-md text-center">
          Supabase is not configured (set{" "}
          <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>).
          Dilution Monitor is open without accounts until then.
        </p>
        <Link
          href="/dilution-monitor"
          className="mt-4 text-sm text-[#58a6ff] underline"
        >
          Back to Dilution Monitor
        </Link>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0d1117] text-[#8b949e] text-sm">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
