import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// --- helper: percentage change
function pctChange(oldVal: number, newVal: number): number {
  return ((newVal - oldVal) / oldVal) * 100;
}

// --- Main handler
export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();

  try {
    // 1. Fetch quote summary (market cap, shares, etc.)
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "defaultKeyStatistics", "financialData"],
    });

    const marketCap = summary.price?.marketCap;
    const sharesOutstanding = summary.defaultKeyStatistics?.sharesOutstanding;
    const floatShares = summary.defaultKeyStatistics?.floatShares;
    const shortPercent = summary.defaultKeyStatistics?.shortPercentOfFloat;
    const insiderOwn = summary.defaultKeyStatistics?.heldPercentInsiders;
    const instOwn = summary.defaultKeyStatistics?.heldPercentInstitutions;

    // 2. Fetch recent historical data (30 days)
    const history = await yahooFinance.historical(ticker, {
      period1: "2024-08-01", // go back a month or so
      interval: "1d",
    });

    const closes = history.map((h) => h.close).filter(Boolean);
    const volumes = history.map((h) => h.volume).filter(Boolean);

    const latestClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const latestVolume = volumes[volumes.length - 1];
    const avgClose5 = closes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
    const avgVol10 = volumes.slice(-11, -1).reduce((a, b) => a + b, 0) / 10;

    // --- 3. Criteria checks (quick rules)
    const criteria = {
      suddenPriceSpike: latestClose > avgClose5 * 2, // 100%+ jump
      suddenVolumeSpike: latestVolume > avgVol10 * 3, // 3x volume
      valuationMismatch: (summary.financialData?.forwardPE || 0) > 80,
      noFundamentalNews: false, // placeholder until we add news API
      recentAuditorChange: false, // placeholder for SEC filings
      reverseSplitOrDilution: false, // placeholder for SEC filings
      insiderSelloff: false, // placeholder
    };

    // --- 4. Score: % of criteria triggered
    const triggered = Object.values(criteria).filter(Boolean).length;
    const total = Object.keys(criteria).length;
    const score = Math.min(100, Math.round((triggered / total) * 100));

    // --- 5. Response JSON
    return NextResponse.json({
      ticker,
      marketCap,
      sharesOutstanding,
      floatShares,
      shortPercent,
      insiderOwn,
      instOwn,
      history,
      criteria,
      score,
    });
  } catch (err: any) {
    console.error("Error fetching data:", err.message);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
