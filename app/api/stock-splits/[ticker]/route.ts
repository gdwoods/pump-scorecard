import { NextResponse } from "next/server";
import { fetchStockSplitsForTicker } from "@/lib/stockSplits";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticker: string }> }
) {
  const apiKey = process.env.POLYGON_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "POLYGON_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const { ticker } = await context.params;
  const sym = (ticker || "").trim().toUpperCase();
  if (!sym || !/^[A-Z]{1,6}$/.test(sym)) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  try {
    const { splits, source } = await fetchStockSplitsForTicker(apiKey, sym, 15);
    return NextResponse.json(
      { ticker: sym, splits, source },
      {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
      }
    );
  } catch (e) {
    console.error("[stock-splits]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load splits" },
      { status: 502 }
    );
  }
}
