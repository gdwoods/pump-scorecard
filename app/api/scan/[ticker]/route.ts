import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// Ensure Node runtime + no caching for fresh data
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Helper: fetch SEC filings (stubbed w/ basic EDGAR link for now) ===
async function fetchSECFilings(ticker: string) {
  try {
    const baseUrl = `https://data.sec.gov/submissions/CIK${ticker}.json`; 
    // Normally you'd map ticker -> CIK, then fetch filings
    // Here we stub with placeholder
    return [
      {
        date: "2025-08-26",
        form: "8-K",
        reason: "Equity financing / dilution risk",
        url: "https://www.sec.gov/Archives/edgar/data/000000/000000-index.htm",
      }
    ];
  } catch {
    return [];
  }
}

// === Helper: stub social hype ===
async function fetchSocialHype(ticker: string) {
  // Later we can plug real APIs like Reddit/Twitter scrapers
  return {
    redditMentions: Math.floor(Math.random() * 50),
    twitterMentions: Math.floor(Math.random() * 50),
    timeline: [
      { day: "Mon", reddit: 2, twitter: 5 },
      { day: "Tue", reddit: 8, twitter: 12 },
      { day: "Wed", reddit: 15, twitter: 18 },
      { day: "Thu", reddit: 10, twitter: 7 },
      { day: "Fri", reddit: 5, twitter: 3 },
    ],
    keywordHeatmap: {
      "pump": 5,
      "moon": 3,
      "insider": 1,
    },
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // === Price / Volume (Yahoo) ===
    const quote = await yahooFinance.quote(tkr);
    const chart = await yahooFinance.chart(tkr, {
      period1: new Date(Date.now() - 14 * 86400 * 1000),
      period2: new Date(),
      interval: '1d',
    });

    const quotes = chart.quotes || [];
    if (!quotes.length) return NextResponse.json({ error: 'No price data' }, { status: 404 });

    const latest = quotes.at(-1)!;
    const prev = quotes.at(-2) ?? latest;
    const avgVol = quotes.reduce((s, q) => s + (q.volume || 0), 0) / (quotes.length || 1);
    const minClose = Math.min(...quotes.map(q => q.close));

    const sudden_volume_spike = !!latest.volume && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev?.close || latest.close) * 1.25 ||
      latest.close > minClose * 2;
    const valuation_fundamentals_mismatch = !quote.trailingPE || quote.trailingPE > 100;

    const history = quotes.map(q => ({
      date: q.date?.toISOString().split('T')[0] || '',
      close: q.close,
      volume: q.volume,
      pctFromMin: ((q.close - minClose) / minClose) * 100,
      spike: q.close > minClose * 2,
    }));

    // === Fundamentals ===
    const marketCap = quote.marketCap ?? null;
    const sharesOutstanding = quote.sharesOutstanding ?? null;
    const floatShares = quote.floatShares ?? null;
    const shortFloat = quote.shortPercentOfFloat ?? null;
    const instOwn = quote.institutionPercent ?? null;
    const insiderOwn = quote.insiderPercent ?? null;

    // === Squeeze risk (simple formula) ===
    const squeezeRiskScore = Math.min(
      100,
      Math.round(
        ((shortFloat || 0) * 0.7) +
        ((avgVol && floatShares) ? (latest.volume / floatShares) * 100 * 0.3 : 0)
      )
    );
    const squeezeLabel =
      squeezeRiskScore > 70 ? "High risk" :
      squeezeRiskScore > 40 ? "Medium risk" : "Low risk";

    // === SEC filings ===
    const sec_flags = await fetchSECFilings(tkr);

    // === Social hype ===
    const hype = await fetchSocialHype(tkr);

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
      squeezeLabel,
      sec_flags,
      hype,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'scan failed' },
      { status: 500 }
    );
  }
}

// ✅ Fix for Vercel TypeScript build
export {};
