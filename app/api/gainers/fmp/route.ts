import { NextResponse } from "next/server";
import { fetchFmpGainerRows, getFmpApiKeyFromEnv } from "@/lib/fmpGainers";
import { enrichRowsWithAskEdgar, getAskEdgarApiKeyFromEnv } from "@/lib/topGainers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const fmpKey = getFmpApiKeyFromEnv();
  if (!fmpKey) {
    return NextResponse.json(
      { error: "FMP_API_KEY is not configured" },
      { status: 503 }
    );
  }

  const askedgarKey = getAskEdgarApiKeyFromEnv();

  try {
    let rows = await fetchFmpGainerRows(fmpKey);
    if (askedgarKey) {
      rows = await enrichRowsWithAskEdgar(rows, askedgarKey);
    } else {
      rows = rows.map((r) => ({ ...r, askEdgar: null }));
    }

    return NextResponse.json(
      {
        updatedAt: new Date().toISOString(),
        source: "fmp",
        askEdgarConfigured: Boolean(askedgarKey),
        count: rows.length,
        gainers: rows,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[gainers/fmp]", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
