"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BG = "#0d1117";
const CARD = "#161b22";
const BORDER = "#30363d";
const ACCENT = "#58a6ff";
const FG = "#e6edf3";

export default function LoginForm() {
  const search = useSearchParams();
  const next = search.get("next") || "/dilution-monitor";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "err">("idle");
  const [err, setErr] = useState<string | null>(null);

  const safeNext = (() => {
    if (!next.startsWith("/") || next.startsWith("//") || next.includes("://")) {
      return "/dilution-monitor";
    }
    return next;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setStatus("sending");
    const origin = window.location.origin;
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      },
    });
    if (error) {
      setErr(error.message);
      setStatus("err");
      return;
    }
    setStatus("sent");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 font-sans"
      style={{ backgroundColor: BG, color: FG }}
    >
      <div
        className="w-full max-w-md rounded-lg border p-6"
        style={{ backgroundColor: CARD, borderColor: BORDER }}
      >
        <h1 className="text-lg font-semibold mb-1" style={{ color: ACCENT }}>
          Sign in
        </h1>
        <p className="text-sm text-[#8b949e] mb-4">
          We will email you a one-time link to open Dilution Monitor. After
          sign-in, save your Ask Edgar API key in Layout (stored encrypted).
        </p>
        {status === "sent" ? (
          <p className="text-sm text-[#8b949e]">
            Check your email for the sign-in link, then return here in this
            browser.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label htmlFor="email" className="text-xs text-[#8b949e] block mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded border bg-[#0d1117] text-sm"
                style={{ borderColor: BORDER, color: FG }}
                required
                autoComplete="email"
                placeholder="you@company.com"
                disabled={status === "sending"}
              />
            </div>
            {err && <p className="text-sm text-red-400">{err}</p>}
            <button
              type="submit"
              className="w-full py-2 rounded font-semibold text-[#0d1117] disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
              disabled={status === "sending" || !email.trim()}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
