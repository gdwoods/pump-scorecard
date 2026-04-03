import { NextResponse } from "next/server";
import { loadAskEdgarDetail } from "@/lib/askEdgarDetail";
import { getAskEdgarApiKeyFromEnv } from "@/lib/topGainers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const apiKey = getAskEdgarApiKeyFromEnv();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ASKEDGAR_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const { ticker } = await context.params;
  const sym = (ticker || "").trim().toUpperCase();
  if (!sym || !/^[A-Z]{1,6}$/.test(sym)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const payload = await loadAskEdgarDetail(sym, apiKey);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("[ask-edgar/detail]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load detail" },
      { status: 502 }
    );
  }
}
