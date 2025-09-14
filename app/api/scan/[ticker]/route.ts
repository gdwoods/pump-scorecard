import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// Helper: limit risk score
function capScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

// Helper: get SEC filings from EDGAR
async function fetchSECFilings(ticker: string) {
  try {
    // Step 1: Lookup CIK
    const cikRes = await fetch(`https://www.sec.gov/files/company_tickers.json`, {
      headers: { "User-Agent": "pump-scorecard (your-email@example.com)" },
    });
    const allTickers = await cikRes.json();

    const entry = Object.values<any>(allTickers).find(
      (c: any) => c.ticker.toUpperCase() === ticker.toUpperCase()
    );
    if (!entry) return [];

    const cik = entry.cik_str.toString().padStart(10, "0");

    // Step 2: Pull filings
    const filingsRes = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { "User-Agent": "pump-scorecard (your-email@example.com)" } }
    );

    const filingsJson = await filingsRes.json();
    const recent = filingsJson.filings.recent;

    const out = [];
    for (let i = 0; i < recent.accessionNumber.length; i++) {
      out.push({
        date: recent.filingDate[i],
        form: recent.form[i],
        reason: recent.primaryDocDescription?.[i] ?? "N/A",
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`,
      });
    }

    return out.slice(0, 10); // latest 10 filings
  } catch (err) {
    console.error("SEC fetch error", err);
    return [];
  }
}

export async function GET(
  req: Request,
  { params }: { params: { ticker: string } }
) {
  const ticker = params.ticker.toUpperCase();

  try {
    // === Market Data ===
    const quote = await yahooFinance.quote(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics"],
    });

    // === Historical Data ===
    const history = await yahooFinance.historical(ticker, {
      period1: "2024-01-01",
      period2: new Date(),
      interval: "1d",
    });

    // === SEC Filings ===
    const sec_flags = await fetchSECFilings(ticker);

    // === Mock Social Media Hype ===
    const hype = {
      redditMentions: Math.floor(Math.random() * 500),
      twitterMentions: Math.floor(Math.random() * 500),
      timeline: Array.from({ length: 7 }).map((_, i) => ({
        day: `Day ${i + 1}`,
        reddit: Math.floor(Math.random() * 100),
        twitter: Math.floor(Math.random() * 100),
      })),
      keywordHeatmap: { "pump": 10, "moon": 7, "rocket": 5 },
    };

    // === Signals (stubbed for now) ===
    const sudden_volume_spike = true;
    const sudden_price_spike = false;
    const valuation_fundamentals_mismatch = true;
    const no_fundamental_news = false;

    // Count auto signals
    const autoSignals = [
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      no_fundamental_news,
    ];
    const triggered = autoSignals.filter(Boolean).length;

    const squeezeRiskScore = capScore((triggered / autoSignals.length) * 100);

    return NextResponse.json({
      ticker,
      last_price: quote.price?.regularMarketPrice,
      latest_volume: quote.price?.regularMarketVolume,
      marketCap: quote.price?.marketCap,
      sharesOutstanding: quote.defaultKeyStatistics?.sharesOutstanding,
      floatShares: quote.defaultKeyStatistics?.floatShares,
      shortFloat: quote.defaultKeyStatistics?.shortPercentOfFloat
        ? quote.defaultKeyStatistics.shortPercentOfFloat * 100
        : null,
      instOwn: quote.defaultKeyStatistics?.institutionPercentHeld
        ? quote.defaultKeyStatistics.institutionPercentHeld * 100
        : null,
      insiderOwn: quote.defaultKeyStatistics?.insiderPercentHeld
        ? quote.defaultKeyStatistics.insiderPercentHeld * 100
        : null,

      // signals
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      no_fundamental_news,

      // derived
      squeezeRiskScore,
      squeezeLabel:
        squeezeRiskScore >= 80
          ? "High"
          : squeezeRiskScore >= 60
          ? "Elevated"
          : "Low",

      // history
      history: history.map((h) => ({
        date: h.date.toISOString().split("T")[0],
        close: h.close,
        volume: h.volume,
      })),

      // filings + hype
      sec_flags,
      hype,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
