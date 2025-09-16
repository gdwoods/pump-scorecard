import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// Risky countries list
const RISKY_COUNTRIES = ["China", "Hong Kong", "Malaysia"];

// Manual criteria placeholders (user-driven, always default false in backend)
const MANUAL_CRITERIA = {
  impersonated_advisors: false,
  guaranteed_returns: false,
  regulatory_alerts: false,
};

// Country normalization map
const COUNTRY_MAP: Record<string, string> = {
  US: "United States",
  USA: "United States",
  CN: "China",
  CHN: "China",
  HK: "Hong Kong",
  HKG: "Hong Kong",
  MY: "Malaysia",
  MYS: "Malaysia",
  IE: "Ireland",
  IRL: "Ireland",
};

function normalizeCountry(value: string | undefined): string {
  if (!value) return "Unknown";
  const key = value.trim().toUpperCase();
  return COUNTRY_MAP[key] || value;
}

// Manual overrides for ADRs / misreported tickers
const COUNTRY_OVERRIDES: Record<string, string> = {
  QMMM: "Hong Kong",
  BREA: "Ireland",
};

function detectCountry(ticker: string, polyMeta: any, quote: any): { country: string; source: string } {
  if (COUNTRY_OVERRIDES[ticker]) {
    return { country: COUNTRY_OVERRIDES[ticker], source: "override" };
  }

  const rawPoly = polyMeta?.results?.locale;
  if (rawPoly) {
    return { country: normalizeCountry(rawPoly), source: "polygon" };
  }

  const rawQuoteRegion = quote?.region;
  if (rawQuoteRegion) {
    return { country: normalizeCountry(rawQuoteRegion), source: "yahoo-region" };
  }

  const rawQuoteCountry = quote?.country;
  if (rawQuoteCountry) {
    return { country: normalizeCountry(rawQuoteCountry), source: "yahoo-country" };
  }

  return { country: "Unknown", source: "none" };
}

// Fraud storage base
const SUPABASE_BASE_URL =
  "https://eagyqnmtlkoahfqqhgwc.supabase.co/storage/v1/object/public";

export async function GET(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    const ticker = (pathname.split("/").pop() || "").toUpperCase();

    // ---------- Yahoo Finance ----------
    let quote: any = {};
    let history: any[] = [];
    try {
      quote = await yahooFinance.quote(ticker);
      const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 180;
      const chart = await yahooFinance.chart(ticker, {
        period1: new Date(Date.now() - SIX_MONTHS_MS),
        period2: new Date(),
        interval: "1d",
      });
      history =
        chart.quotes?.map((q: any) => ({
          date: q.date?.toISOString().split("T")[0] || "",
          close: q.close,
          volume: q.volume,
        })) || [];
    } catch (err) {
      console.error("⚠️ Yahoo fetch failed:", err);
    }

    const latest = history.at(-1) || {};
    const prev = history.at(-2) || latest;
    const avgVol =
      history.reduce((s, q) => s + (q.volume || 0), 0) /
        (history.length || 1) || 0;
    const minClose = history.length
      ? Math.min(...history.map((q) => q.close))
      : 0;

    // ---------- Polygon Meta ----------
    let polyMeta: any = {};
    try {
      const polyRes = await fetch(
        `https://api.polygon.io/v3/reference/tickers/${ticker}?apiKey=${process.env.POLYGON_KEY}`
      );
      if (polyRes.ok) polyMeta = await polyRes.json();
    } catch (err) {
      console.error("⚠️ Polygon meta failed:", err);
    }

    // ---------- Promotions ----------
    let promotions: any[] = [];
    try {
      const promoRes = await fetch(
        `https://www.stockpromotiontracker.com/api/stock-promotions?ticker=${ticker}&dateRange=all&limit=10&offset=0&sortBy=promotion_date&sortDirection=desc`
      );
      if (promoRes.ok) {
        const promoJson = await promoRes.json();
        promotions = promoJson.results || [];
      }
    } catch (err) {
      console.error("⚠️ Promotions fetch failed:", err);
    }

    // ---------- SEC Filings ----------
    let filings: any[] = [];
    try {
      const secRes = await fetch(
        `https://data.sec.gov/submissions/CIK${ticker}.json`,
        { headers: { "User-Agent": "pump-scorecard" } }
      );
      if (secRes.ok) {
        const secJson = await secRes.json();
        filings = secJson?.filings?.recent || [];
      }
    } catch (err) {
      console.error("⚠️ SEC fetch failed:", err);
    }

    // ---------- Fraud Evidence ----------
    let fraudImages: any[] = [];
    try {
      const fraudRes = await fetch(
        `https://www.stopnasdaqchinafraud.com/api/stop-nasdaq-fraud?page=0&searchText=${ticker}`
      );
      if (fraudRes.ok) {
        const fraudJson = await fraudRes.json();
        fraudImages = (fraudJson.results || [])
          .filter((f: any) => {
            // strict match
            const tickers = (f.tickers || []).map((t: string) => t.toUpperCase());
            if (tickers.includes(ticker)) return true;

            // fallback: check companyName or imagePath
            if (f.companyName?.toUpperCase().includes(ticker)) return true;
            if (f.imagePath?.toUpperCase().includes(ticker)) return true;

            return false;
          })
          .map((f: any, idx: number) => ({
            full: `${SUPABASE_BASE_URL}/${f.imagePath}`,
            thumb: `${SUPABASE_BASE_URL}/${f.thumbnailPath}`,
            approvedAt: f.approvedAt,
            id: f.id,
            label: `Fraud screenshot ${idx + 1} for ${ticker}`,
          }));
      }
    } catch (err) {
      console.error("⚠️ Fraud API fetch failed:", err);
    }
    const fraudEvidence = fraudImages.length > 0;

    // ---------- Auto Criteria ----------
    const sudden_volume_spike =
      !!latest.volume && avgVol > 0 && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev.close || latest.close) * 1.25 ||
      latest.close > (minClose || latest.close) * 2;
    const valuation_fundamentals_mismatch =
      !quote.trailingPE || quote.trailingPE > 100;
    const reverse_split = filings.some((f: any) =>
      (f.form || "").toLowerCase().includes("split")
    );
    const dividend_announced = filings.some((f: any) =>
      (f.form || "").toLowerCase().includes("dividend")
    );
    const promoted_stock = promotions.length > 0;
    const dilution_or_offering = filings.some((f: any) =>
      (f.form || "").includes("S-1") ||
      (f.form || "").includes("424B")
    );

    // ---------- Country ----------
    const { country, source: countrySource } = detectCountry(ticker, polyMeta, quote);
    const riskyCountry = RISKY_COUNTRIES.includes(country);

    // ---------- Scores ----------
    const flatCriteria = [
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,
      fraudEvidence,
    ].filter(Boolean).length;

    const flatRiskScore = Math.round((flatCriteria / 10) * 100);

    let weightedScore = flatRiskScore;
    if (promoted_stock) weightedScore += 20;
    if (riskyCountry) weightedScore += 20;
    if (dilution_or_offering) weightedScore += 10;
    if (fraudEvidence) weightedScore += 15;
    if (weightedScore > 100) weightedScore = 100;

    // ---------- Summary ----------
    let summaryVerdict = "Low risk";
    if (weightedScore >= 70) summaryVerdict = "High risk";
    else if (weightedScore >= 40) summaryVerdict = "Moderate risk";

    let reasons: string[] = [];
    if (reverse_split) reasons.push("a reverse split");
    if (promoted_stock) reasons.push("active stock promotions");
    if (dilution_or_offering) reasons.push("a recent dilution filing");
    if (riskyCountry) reasons.push(`incorporation in ${country}`);
    if (fraudEvidence) reasons.push("fraud evidence screenshots");

    let summaryText = "";
    if (summaryVerdict === "Low risk") {
      summaryText =
        "This one looks pretty clean — no major pump-and-dump signals right now.";
    } else if (summaryVerdict === "Moderate risk") {
      summaryText = `Worth keeping an eye on. I spotted ${reasons.join(
        ", "
      )}. Not screaming pump yet, but caution is warranted.`;
    } else {
      summaryText = `This stock is lighting up the board — ${reasons.join(
        ", "
      )} make it look like a prime pump-and-dump candidate.`;
    }

    // ---------- Always Respond ----------
    return NextResponse.json({
      ticker,
      companyName: quote.longName || quote.shortName || ticker,

      // auto criteria
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split,
      dividend_announced,
      promoted_stock,
      dilution_or_offering,
      riskyCountry,
      fraudEvidence,

      // manual criteria placeholders
      ...MANUAL_CRITERIA,

      // fundamentals
      last_price: latest.close || null,
      avg_volume: avgVol || null,
      latest_volume: latest.volume || null,
      marketCap: quote.marketCap || null,
      sharesOutstanding: quote.sharesOutstanding || null,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      shortFloat: (quote as any)?.shortRatio || null,
      insiderOwn: (quote as any)?.insiderHoldPercent || null,
      instOwn: (quote as any)?.institutionalHoldPercent || null,

      // meta
      exchange: polyMeta?.results?.primary_exchange || quote.fullExchangeName || "Unknown",
      country,
      countrySource, // ✅ show where it came from

      // history + external data
      history,
      promotions,
      filings,
      fraudImages,

      // scores
      flatRiskScore,
      weightedRiskScore: weightedScore,

      // summary
      summaryVerdict,
      summaryText,
    });
  } catch (err: any) {
    console.error("❌ Fatal route error:", err);
    return NextResponse.json({
      error: err.message || "scan failed",
      ...MANUAL_CRITERIA,
    });
  }
}
