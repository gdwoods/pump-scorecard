import { NextResponse } from "next/server";
import { loadAskEdgarDetailCached } from "@/lib/askEdgarDetail";
import {
  ASKEDGAR_ENV_KEYS,
  getAskEdgarApiKeyFromEnv,
} from "@/lib/topGainers";

export const runtime = "nodejs";

/** Allow CDN/browser to cache successful JSON for 30m; errors stay uncached. */

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const apiKey = getAskEdgarApiKeyFromEnv();
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Ask Edgar API key is not configured",
        hint: `Set one of ${ASKEDGAR_ENV_KEYS.join(", ")} in Vercel → Project → Settings → Environment Variables (enable Production), then Redeploy. If you use the short-check deployment, add the variable there—not only on a legacy project.`,
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
    const payload = await loadAskEdgarDetailCached(sym, apiKey);
    const cacheable =
      !payload.meta?.rateLimited && !payload.meta?.authError;
    return NextResponse.json(payload, {
      headers: cacheable
        ? {
            "Cache-Control":
              "public, max-age=1800, s-maxage=1800, stale-while-revalidate=7200",
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
