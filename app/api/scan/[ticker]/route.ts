import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// Helper to fetch text
async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "pump-scorecard/1.0" } });
  if (!res.ok) throw new Error(`Failed fetch: ${url}`);
  return res.text();
}

// Fetch SEC CIK from ticker
async function fetchCik(ticker: string): Promise<string | null> {
  try {
    const url = `https://www.sec.gov/files/company_tickers.json`;
    const text = await fetchText(url);
    const data = JSON.parse(text);
    for (const key of Object.keys(data)) {
      if (data[key].ticker?.toLowerCase() === ticker.toLowerCase()) {
        return data[key].cik_str.toString().padStart(10, "0");
      }
    }
  } catch (err) {
    console.error("CIK lookup failed", err);
  }
  return null;
}

// Fetch recent SEC filings
async function fetchSecFilings(ticker: string) {
  const cik = await fetchCik(ticker);
  if (!cik) return [];

  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const text = await fetchText(url);
    const data = JSON.parse(text);

    const recent = data.filings?.recent;
    if (!recent) return [];

    const filings = [];
    for (let i = 0; i < recent.accessionNumber.length; i++) {
      filings.push({
        date: recent.filingDate[i],
        form: recent.form[i],
        reason: recent.primaryDocDescription?.[i] ?? "",
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`,
      });
    }

    // Filter down to common pump/dilution-related filings
    return filings.filter((f) =>
      ["S-1", "S-3", "8-K", "424B"].some((code) => f.form.includes(code))
    ).slice(0, 5);
  } catch (err) {
    console.error("SEC fetch failed", err);
    return [];
  }
}

// Main handler
export async function GET(
  req: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  let quote: any = {};
  try {
    quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "defaultKeyStatistics", "summaryDetail"],
    });
  } catch (err) {
    console.error("Yahoo Finance error:", err);
  }

  // SEC filings (real)
  const sec_flags = await fetchSecFilings(ticker);

  // Mock hype data for now
  const hype = {
    redditMentions: null,
    twitterMentions: null,
    timeline: [],
    keywordHeatmap: {},
  };

  // Compute squeeze score
  let squeezeRiskScore = 0;
  if (quote?.defaultKeyStatistics?.shortPercentOfFloat) {
    squeezeRiskScore += Math.min(
      50,
      (quote.defaultKeyStatistics.shortPercentOfFloat * 100) / 2
    );
  }
  if (quote?.summaryDetail?.volume && quote?.defaultKeyStatistics?.floatShares) {
    const turnover =
      quote.summaryDetail.volume / quote.defaultKeyStatistics.floatShares;
    squeezeRiskScore += Math.min(50, turnover * 100);
  }
  squeezeRiskScore = Math.min(100, Math.round(squeezeRiskScore));

  return NextResponse.json({
    ticker,
    last_price: quote?.price?.regularMarketPrice,
    latest_volume: quote?.price?.regularMarketVolume,
    marketCap: quote?.price?.marketCap,
    sharesOutstanding: quote?.defaultKeyStatistics?.sharesOutstanding,
    floatShares: quote?.defaultKeyStatistics?.floatShares,
    shortFloat: quote?.defaultKeyStatistics?.shortPercentOfFloat
      ? Math.round(quote.defaultKeyStatistics.shortPercentOfFloat * 10000) /
        100
      : null,
    instOwn: quote?.defaultKeyStatistics?.heldPercentInstitutions
      ? quote.defaultKeyStatistics.heldPercentInstitutions * 100
      : null,
    insiderOwn: quote?.defaultKeyStatistics?.heldPercentInsiders
      ? quote.defaultKeyStatistics.heldPercentInsiders * 100
      : null,
    squeezeRiskScore,
    squeezeLabel:
      squeezeRiskScore > 70
        ? "High"
        : squeezeRiskScore > 40
        ? "Medium"
        : "Low",
    sec_flags,
    hype,
    history: [], // keep placeholder
  });
}

export const dynamic = "force-dynamic";
