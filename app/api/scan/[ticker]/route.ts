import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// Ensure Node runtime + no caching for fresh data
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchSECCompanyCIK(ticker: string): Promise<string | null> {
  const url = "https://www.sec.gov/files/company_tickers.json";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "pump-scorecard" } });
    const data = await res.json();
    const entry = Object.values<any>(data).find(
      (v) => v.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (entry) return entry.cik_str.toString().padStart(10, "0");

    // fallback: direct SEC search-index
    const search = await fetch("https://efts.sec.gov/LATEST/search-index", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "pump-scorecard",
      },
      body: JSON.stringify({ keys: ticker }),
    }).then((r) => r.json());

    const firstHit = search?.hits?.hits?.[0]?._source?.ciks?.[0];
    if (firstHit) return firstHit.padStart(10, "0");
  } catch (e) {
    console.error("CIK lookup failed", e);
  }
  return null;
}

async function fetchRecentFilings(cik: string) {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await fetch(url, { headers: { "User-Agent": "pump-scorecard" } });
  const data = await res.json();
  const recent = data.filings?.recent;
  if (!recent) return [];

  const flagged = [];
  for (let i = 0; i < recent.accessionNumber.length; i++) {
    const form = recent.form[i];
    if (["8-K", "10-K", "10-Q", "S-1"].includes(form)) {
      flagged.push({
        date: recent.filingDate[i],
        form,
        url: `https://www.sec.gov/Archives/edgar/data/${parseInt(
          cik
        )}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`,
        reason: form,
      });
    }
  }
  return flagged.slice(0, 10);
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // === Price & Fundamentals (Yahoo) ===
    const quote = await yahooFinance.quoteSummary(tkr, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "majorHoldersBreakdown",
      ],
    });

    const marketCap = quote.price?.marketCap;
    const sharesOutstanding = quote.defaultKeyStatistics?.sharesOutstanding;
    const floatShares = quote.defaultKeyStatistics?.floatShares;
    const shortFloat = quote.defaultKeyStatistics?.shortPercentOfFloat
      ? quote.defaultKeyStatistics.shortPercentOfFloat * 100
      : null;
    const instOwn = quote.majorHoldersBreakdown?.institutionsPercentHeld
      ? quote.majorHoldersBreakdown.institutionsPercentHeld * 100
      : null;
    const insiderOwn = quote.majorHoldersBreakdown?.insidersPercentHeld
      ? quote.majorHoldersBreakdown.insidersPercentHeld * 100
      : null;

    // === Chart data for spikes ===
    const chart = await yahooFinance.chart(tkr, {
      period1: new Date(Date.now() - 14 * 86400 * 1000),
      period2: new Date(),
      interval: "1d",
    });
    const quotes = chart.quotes || [];
    if (!quotes.length)
      return NextResponse.json({ error: "No price data" }, { status: 404 });

    const latest = quotes.at(-1)!;
    const prev = quotes.at(-2) ?? latest;
    const avgVol =
      quotes.reduce((s, q) => s + (q.volume || 0), 0) / (quotes.length || 1);
    const minClose = Math.min(...quotes.map((q) => q.close));

    const sudden_volume_spike =
      !!latest.volume && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev?.close || latest.close) * 1.25 ||
      latest.close > minClose * 2;
    const valuation_fundamentals_mismatch =
      !quote.summaryDetail?.trailingPE ||
      quote.summaryDetail.trailingPE > 100;

    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split("T")[0] || "",
      close: q.close,
      volume: q.volume,
      pctFromMin: ((q.close - minClose) / minClose) * 100,
      spike: q.close > minClose * 2,
    }));

    // === SEC filings ===
    const cik = await fetchSECCompanyCIK(tkr);
    const sec_flags = cik ? await fetchRecentFilings(cik) : [];

    // === Squeeze Risk Score ===
    let squeezeRiskScore = 0;
    if (floatShares && latest.volume) {
      const turnover = (latest.volume / floatShares) * 100;
      if (turnover > 50) squeezeRiskScore += 40;
    }
    if (shortFloat && shortFloat > 20) squeezeRiskScore += 40;
    if (instOwn && instOwn < 10) squeezeRiskScore += 20;
    if (insiderOwn && insiderOwn < 5) squeezeRiskScore += 10;

    squeezeRiskScore = Math.min(100, Math.max(0, squeezeRiskScore));

    return NextResponse.json({
      ticker: tkr,
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      history,
      marketCap,
      sharesOutstanding,
      floatShares,
      shortFloat,
      instOwn,
      insiderOwn,
      squeezeRiskScore,
      squeezeLabel:
        squeezeRiskScore >= 70
          ? "High"
          : squeezeRiskScore >= 40
          ? "Medium"
          : "Low",
      sec_flags,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "scan failed" },
      { status: 500 }
    );
  }
}

export {};
