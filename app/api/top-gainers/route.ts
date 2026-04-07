import { NextRequest, NextResponse } from "next/server";
import {
  enrichRowsWithAskEdgar,
  fetchPolygonGainers,
  fetchTradingViewGainersFallback,
  getAskEdgarApiKeyFromEnv,
  TOP_GAINERS_MAX_PRICE,
  TOP_GAINERS_MIN_CHANGE_PCT,
  TOP_GAINERS_MIN_PRICE,
} from "@/lib/topGainers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const polygonKey = process.env.POLYGON_API_KEY?.trim();
  if (!polygonKey) {
    return NextResponse.json(
      { error: "POLYGON_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const includeOtc =
    searchParams.get("includeOtc") === "1" ||
    searchParams.get("include_otc") === "true";
  const enrichParam = searchParams.get("enrich");
  const wantEnrich = enrichParam !== "0" && enrichParam !== "false";
  const askedgarKey = getAskEdgarApiKeyFromEnv();
  const allowTvFallback =
    searchParams.get("tvFallback") !== "0" &&
    searchParams.get("tv_fallback") !== "false";

  try {
    let rows = await fetchPolygonGainers(polygonKey, includeOtc);
    let source: "polygon" | "tradingview" = "polygon";

    if (rows.length === 0 && allowTvFallback) {
      rows = await fetchTradingViewGainersFallback();
      source = "tradingview";
      console.warn(
        "[top-gainers] Polygon movers snapshot was empty; using TradingView scanner fallback"
      );
    }

    if (wantEnrich && askedgarKey) {
      rows = await enrichRowsWithAskEdgar(rows, askedgarKey);
    } else {
      rows = rows.map((r) => ({ ...r, askEdgar: null }));
    }

    const askEdgarHits = rows.filter(
      (r) => !!r.askEdgar?.overallOfferingRisk
    ).length;

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        source,
        minChangePct: TOP_GAINERS_MIN_CHANGE_PCT,
        minPrice: TOP_GAINERS_MIN_PRICE,
        maxPrice: TOP_GAINERS_MAX_PRICE,
        askEdgarConfigured: Boolean(askedgarKey),
        askEdgarEnriched: Boolean(wantEnrich && askedgarKey),
        askEdgarHits,
        count: rows.length,
        gainers: rows,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[top-gainers]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
