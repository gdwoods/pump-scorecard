import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const POLYGON_API_KEY =
  process.env.POLYGON_API_KEY || "63jObbOEdJ8t20ZGO2Xkjb0KIrqI1950";

/* ------------------ Helpers ------------------ */
async function fetchJSON(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPolygon(endpoint: string) {
  const url =
    endpoint.includes("?")
      ? `${endpoint}&apiKey=${POLYGON_API_KEY}`
      : `${endpoint}?apiKey=${POLYGON_API_KEY}`;
  return fetchJSON(url);
}

async function fetchTickerMeta(ticker: string) {
  return fetchPolygon(`https://api.polygon.io/v3/reference/tickers/${ticker}`);
}

async function fetchSplits(ticker: string) {
  return fetchPolygon(
    `https://api.polygon.io/v3/reference/splits?ticker=${ticker}&limit=25`
  );
}

async function fetchDividends(ticker: string) {
  return fetchPolygon(
    `https://api.polygon.io/v3/reference/dividends?ticker=${ticker}&limit=25`
  );
}

async function fetchPromotions(ticker: string) {
  return fetchJSON(
    `https://www.stockpromotiontracker.com/api/stock-promotions?offset=0&limit=20&ticker=${ticker}&dateRange=all&sortBy=promotion_date&sortDirection=desc`
  );
}

async function fetchSECFilings(ticker: string) {
  const searchUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=&dateb=&owner=exclude&count=20&output=atom`;
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "pump-scorecard (email@example.com)" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const matches = [...text.matchAll(/<entry>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link href="(.*?)"/g)];
    return matches.map((m) => ({
      title: m[1],
      url: m[2],
    }));
  } catch {
    return [];
  }
}

/* ------------------ API ------------------ */
export async function GET(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    const ticker = (pathname.split("/").pop() || "").toUpperCase();

    // Yahoo Finance: quote + history
    const quote = await yahooFinance.quote(ticker);
    const now = new Date();
    const SIX_MONTHS = 1000 * 60 * 60 * 24 * 180;
    const chart = await yahooFinance.chart(ticker, {
      period1: new Date(now.getTime() - SIX_MONTHS),
      period2: now,
      interval: "1d",
    });

    const quotes = chart.quotes || [];
    if (!quotes.length) {
      return NextResponse.json({ error: "No price data", ticker }, { status: 404 });
    }

    const latest = quotes.at(-1)!;
    const prev = quotes.at(-2) ?? latest;
    const avgVol =
      quotes.reduce((s, q) => s + (q.volume || 0), 0) / quotes.length;
    const minClose = Math.min(...quotes.map((q) => q.close || 0));

    const sudden_volume_spike =
      (latest.volume || 0) > Math.max(1, avgVol * 3);
    const sudden_price_spike =
      latest.close > (prev.close || 0) * 1.25 || latest.close > minClose * 2;
    const valuation_fundamentals_mismatch =
      quote.trailingPE == null || quote.trailingPE > 100;

    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split("T")[0] || "",
      close: q.close,
      volume: q.volume,
    }));

    // Polygon fundamentals
    const [polyMeta, splitsRes, dividendsRes] = await Promise.all([
      fetchTickerMeta(ticker),
      fetchSplits(ticker),
      fetchDividends(ticker),
    ]);

    const splits = splitsRes?.results || [];
    const dividends = dividendsRes?.results || [];
    const reverse_split = splits.some((s: any) => {
      const from = Number(s.split_from ?? s.for_factor ?? 1);
      const to = Number(s.split_to ?? s.to_factor ?? 1);
      return to > from;
    });
    const dividend_announced = dividends.length > 0;

    // Promotions
    const promotions = await fetchPromotions(ticker);
    const formattedPromos =
      promotions?.results?.map((p: any) => ({
        promotion_date: p.promotion_date,
        company_name: p.company_name,
        promoting_firm: p.promoting_firm,
        type: p.type, // "campaign", "disclosure", "press_release"
        url: `https://www.stockpromotiontracker.com/stock/${ticker}`,
      })) || [];

    const promoted_stock = formattedPromos.length > 0;

    // SEC filings
    const filings = await fetchSECFilings(ticker);
    const dilution_or_offering = filings.some((f) =>
      /(S-1|S-3|424B|offering|prospectus|dilution)/i.test(f.title)
    );

    // Country detection
    let country =
      polyMeta?.results?.address?.country ||
      polyMeta?.results?.home_country ||
      quote?.region ||
      "Unknown";

    const exch =
      (polyMeta?.results?.primary_exchange || "").toUpperCase() ||
      (quote.exchange || "").toUpperCase();

    if (country === "US" || country === "Unknown") {
      if (exch.includes("HKG")) country = "Hong Kong";
      else if (exch.includes("SHZ") || exch.includes("SHG")) country = "China";
      else if (exch.includes("MYX")) country = "Malaysia";
    }

    const manualOverrides: Record<string, string> = {
      PTNM: "Hong Kong",
      TOP: "Hong Kong",
      MEGL: "Hong Kong",
    };
    if (manualOverrides[ticker]) {
      country = manualOverrides[ticker];
    }

    const riskyCountry = ["china", "hong kong", "malaysia"].some((k) =>
      country.toLowerCase().includes(k)
    );

    // Scoring
    const flatCriteria = [
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,
    ].filter(Boolean).length;
    const flatRiskScore = Math.round((flatCriteria / 10) * 100);

    let weightedScore = flatRiskScore;
    if (promoted_stock) weightedScore += 20;
    if (riskyCountry) weightedScore += 20;
    if (dilution_or_offering) weightedScore += 10;
    if (weightedScore > 100) weightedScore = 100;

    return NextResponse.json({
      ticker,
      companyName: quote.longName || quote.shortName || ticker,

      // criteria
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,

      // fundamentals
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      shortFloat: (quote as any)?.shortRatio || null,
      insiderOwn: (quote as any)?.insiderHoldPercent || null,
      instOwn: (quote as any)?.institutionalHoldPercent || null,

      // meta
      exchange: polyMeta?.results?.primary_exchange || quote.fullExchangeName || "Unknown",
      country,

      // history + external data
      history,
      promotions: formattedPromos,
      filings,

      // scores
      flatRiskScore,
      weightedRiskScore: weightedScore,
    });
  } catch (err: any) {
    console.error("❌ Error in /api/scan", err);
    return NextResponse.json({ error: err.message || "scan failed" }, { status: 500 });
  }
}
