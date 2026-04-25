import { NextResponse } from "next/server";
import { loadAskEdgarDetailCached } from "@/lib/askEdgarDetail";
import { ASKEDGAR_ENV_KEYS } from "@/lib/topGainers";
import { resolveAskEdgarApiKey } from "@/lib/resolveAskEdgarApiKey";

export const runtime = "nodejs";

/** Allow CDN/browser to cache successful JSON for 30m; errors stay uncached. */

export async function GET(
  req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const resolved = await resolveAskEdgarApiKey();
  const apiKey = resolved.key;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Ask Edgar API key is not configured",
        hint: `Sign in to Dilution Monitor and save your key under Layout, or set one of ${ASKEDGAR_ENV_KEYS.join(", ")} in Vercel (not shown to other users).`,
      },
      { status: 503 }
    );
  }

  const { ticker } = await context.params;
  const sym = (ticker || "").trim().toUpperCase();
  if (!sym || !/^[A-Z]{1,6}$/.test(sym)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const modeParam = String(searchParams.get("mode") || "basic").toLowerCase();
    const mode = modeParam === "full" ? "full" : modeParam === "news" ? "news" : "basic";
    const payload = await loadAskEdgarDetailCached(sym, apiKey, mode);
    const cacheable =
      !payload.meta?.rateLimited && !payload.meta?.authError;
    return NextResponse.json(payload, {
      headers: cacheable
        ? {
            "Cache-Control":
              "public, max-age=2700, s-maxage=2700, stale-while-revalidate=10800",
          }
        : { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[ask-edgar/detail]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load detail" },
      { status: 502 }
    );
  }
}
