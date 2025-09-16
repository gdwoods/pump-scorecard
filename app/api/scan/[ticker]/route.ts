import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Prefer ENV; falls back to the key you shared (ok for local dev).
const POLYGON_API_KEY =
  process.env.POLYGON_API_KEY || "63jObbOEdJ8t20ZGO2Xkjb0KIrqI1950";

/* ----------------------------- helpers ----------------------------- */

async function fetchJSON(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
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

// yahooFinance.quoteSummary for company HQ country
async function fetchProfile(ticker: string) {
  try {
    const qs = await yahooFinance.quoteSummary(ticker, {
      modules: ["assetProfile"],
    });
    // some tickers return { assetProfile: {...} } directly
    return qs;
  } catch {
    return null;
  }
}

// EDGAR Atom feed (simple, robust, no jsdom)
async function fetchText(url: string, timeout = 7000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const txt = await res.text();
    clearTimeout(id);
    return txt;
  } catch {
    clearTimeout(id);
    return "";
  }
}

const SEC_KEYWORDS = [
  "offering",
  "registered direct",
  "s-1",
  "s-3",
  "atm",
  "equity distribution",
  "prospectus",
  "warrant",
  "convertible",
  "rights offering",
  "shelf",
  "subscription",
  "purchase agreement",
];

async function fetchOfferingsFromSEC(cikOrTicker: string) {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(
    cikOrTicker
  )}&owner=exclude&count=40&output=atom`;
  const xml = await fetchText(url, 7000);
  if (!xml) return [];

  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map(
    (m) => m[1]
  );

  const flags: Array<{ date: string; description: string; url?: string }> = [];
  for (const entry of entries) {
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1] || "";
    const summary = entry.match(/<summary.*?>([\s\S]*?)<\/summary>/)?.[1] || "";
    const updated = entry.match(/<updated>(.*?)<\/updated>/)?.[1] || "";
    const link = entry.match(/<link href="(.*?)"/)?.[1] || "";
    const content = (title + " " + summary).replace(/<[^>]+>/g, "").toLowerCase();

    if (SEC_KEYWORDS.some((k) => content.includes(k))) {
      flags.push({
        date: updated?.split("T")[0] || "",
        description: title || "SEC filing",
        url: link || undefined,
      });
    }
  }
  return flags;
}

async function fetchPromotionsGrouped(ticker: string) {
  // type can be: campaign | disclosure | promoted_press_release
  async function one(type: string) {
    const url =
      `https://www.stockpromotiontracker.com/api/stock-promotions?` +
      `offset=0&limit=10&ticker=${encodeURIComponent(
        ticker
      )}&dateRange=all&type=${encodeURIComponent(
        type
      )}&sortBy=promotion_date&sortDirection=desc`;
    const data = await fetchJSON(url);
    const results = data?.results || [];
    return results.map((r: any) => ({
      promotion_date: r.promotion_date,
      company_name: r.company_name,
      ticker: r.ticker,
      promoting_firm: r.promoting_firm,
      type,
      // prefer actions_url if present
      link:
        r.actions_url ||
        r.action_url ||
        r.url ||
        `https://www.stockpromotiontracker.com/?ticker=${encodeURIComponent(
          r.ticker || ticker
        )}&type=${encodeURIComponent(type)}`,
    }));
  }

  const [campaigns, disclosures, pressReleases] = await Promise.all([
    one("campaign"),
    one("disclosure"),
    one("promoted_press_release"),
  ]);

  return { campaigns, disclosures, pressReleases };
}

/* ------------------------------ API ------------------------------- */

export async function GET(request: Request) {
  try {
    const { pathname } = new URL(request.url);
    const ticker = (pathname.split("/").pop() || "").toUpperCase();

    // 1) Yahoo Finance: quote + 6m daily chart
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
      return NextResponse.json(
        { error: "No price data", ticker },
        { status: 404 }
      );
    }

    const latest = quotes.at(-1)!;
    const prev = quotes.at(-2) ?? latest;
    const avgVol =
      quotes.reduce((s, q) => s + (q.volume || 0), 0) / quotes.length;
    const minClose = Math.min(...quotes.map((q) => q.close || 0));

    const sudden_volume_spike =
      (latest.volume || 0) > Math.max(1, avgVol * 3);
    const sudden_price_spike =
      (!!latest.close &&
        !!prev.close &&
        (latest.close > prev.close * 1.25 || latest.close > minClose * 2)) ||
      false;
    const valuation_fundamentals_mismatch =
      quote.trailingPE == null || isNaN(quote.trailingPE) || quote.trailingPE > 100;

    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split("T")[0] || "",
      close: q.close,
      volume: q.volume,
    }));

    // 2) Polygon: meta + splits + dividends
    const [polyMeta, splitsRes, dividendsRes] = await Promise.all([
      fetchTickerMeta(ticker),
      fetchSplits(ticker),
      fetchDividends(ticker),
    ]);

    const splits = splitsRes?.results || [];
    const dividends = dividendsRes?.results || [];

    // Reverse split detection (robust to field names)
    const split_flags: Array<{ execution_date: string; description: string }> =
      [];
    for (const s of splits) {
      const from = Number(
        s.split_from ?? s.for_factor ?? s.forFactor ?? s.denominator ?? s.from ?? 1
      );
      const to = Number(
        s.split_to ?? s.to_factor ?? s.toFactor ?? s.numerator ?? s.to ?? 1
      );
      if (isFinite(from) && isFinite(to) && to > from) {
        split_flags.push({
          execution_date: s.execution_date || s.declaration_date || "",
          description: `${from}-for-${to} reverse split`,
        });
      }
    }

    // Dividends (neutral in scoring; still returned)
    const dividend_flags: Array<{
      ex_dividend_date?: string;
      cash_amount?: number;
      frequency?: string;
    }> = dividends.map((d: any) => ({
      ex_dividend_date: d.ex_dividend_date,
      cash_amount: d.cash_amount,
      frequency: d.frequency,
    }));

    // 3) SEC offerings / dilution flags (via EDGAR Atom)
    const cik = (quote as any)?.cik?.toString?.() || ticker;
    const offering_flags = await fetchOfferingsFromSEC(cik);

    // 4) StockPromotionTracker
    const promotionsGrouped = await fetchPromotionsGrouped(ticker);
    const promoted_stock =
      promotionsGrouped.campaigns.length > 0 ||
      promotionsGrouped.disclosures.length > 0 ||
      promotionsGrouped.pressReleases.length > 0;

    // 5) Country detection (multi-source + overrides)
    const profile = await fetchProfile(ticker);

    // Initial country from best-known sources
    let country: string =
      profile?.assetProfile?.country ||
      polyMeta?.results?.address?.country ||
      polyMeta?.results?.home_country ||
      polyMeta?.results?.locale ||
      quote?.region ||
      "Unknown";

    // Exchange inference (Polygon primary_exchange OR Yahoo exchange)
    let exch =
      (polyMeta?.results?.primary_exchange || "").toUpperCase() ||
      (quote.exchange || "").toUpperCase();

    // Description hint (Yahoo longBusinessSummary)
    const desc =
      profile?.assetProfile?.longBusinessSummary?.toLowerCase?.() || "";

    if (desc.includes("hong kong")) country = "Hong Kong";
    else if (desc.includes("china")) country = "China";
    else if (desc.includes("malaysia")) country = "Malaysia";

    if (country === "US" || country === "Unknown") {
      if (exch.includes("HKG") || exch.includes("HKSE")) country = "Hong Kong";
      else if (exch.includes("SHZ") || exch.includes("SHG")) country = "China";
      else if (exch.includes("MYX")) country = "Malaysia";
      else if (exch.includes("SGX")) country = "Singapore";
    }

    if (country === "US" || country === "Unknown") {
      // simple heuristic: .HK / numeric 4-5 digits
      if (ticker.endsWith(".HK") || /^[0-9]{4,5}$/.test(ticker)) {
        country = "Hong Kong";
      }
    }

    // Manual corrections for misclassified ADRs / common pump targets
    const manualOverrides: Record<string, string> = {
      PTNM: "Hong Kong",
      TOP: "Hong Kong",
      MEGL: "Hong Kong",
      YGMZ: "China",
      BON: "China",
    };
    if (manualOverrides[ticker]) {
      country = manualOverrides[ticker];
    }

    const riskyCountry = ["china", "hong kong", "malaysia"].some((k) =>
      country.toLowerCase().includes(k)
    );

    // 6) Weighted score (dividend = neutral)
    let weightedScore = 0;
    if (split_flags.length > 0) weightedScore += 30; // reverse split
    if (offering_flags.length > 0) weightedScore += 30; // dilution/offering
    if (sudden_volume_spike) weightedScore += 15;
    if (sudden_price_spike) weightedScore += 15;
    if (valuation_fundamentals_mismatch) weightedScore += 10;
    if (promotionsGrouped.campaigns.length > 0) weightedScore += 20;
    if (promotionsGrouped.disclosures.length > 0) weightedScore += 10;
    if (promotionsGrouped.pressReleases.length > 0) weightedScore += 10;
    if (riskyCountry) weightedScore += 20;
    if (weightedScore > 100) weightedScore = 100;

    return NextResponse.json({
      ticker,
      // auto criteria booleans for UI checkboxes
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split: split_flags.length > 0,
      dilution_or_offering: offering_flags.length > 0,
      dividend_announced: dividend_flags.length > 0, // neutral in score
      promoted_stock,

      // quick stats
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,

      // country + risk
      exchange:
        polyMeta?.results?.primary_exchange || quote?.fullExchangeName || "Unknown",
      country,
      riskyCountry,

      // chart data
      history,

      // details
      split_flags,
      dividend_flags,
      offering_flags,
      promotions: promotionsGrouped,

      // scores
      weightedScore,
    });
  } catch (err: any) {
    console.error("❌ Error in /api/scan", err);
    return NextResponse.json(
      { error: err?.message || "scan failed" },
      { status: 500 }
    );
  }
}
