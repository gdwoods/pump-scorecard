import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

// === Helper functions ===
async function fetchFilings(cik: string) {
  try {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "pump-scorecard/1.0" },
    });
    if (!res.ok) return [];
    const data = await res.json();

    const recent = (data.filings?.recent || {});
    const count = Math.min(recent.accessionNumber?.length || 0, 10);

    let filings = [];
    for (let i = 0; i < count; i++) {
      filings.push({
        date: recent.filingDate[i],
        form: recent.form[i],
        reason: recent.primaryDocDescription[i] || "Filing",
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replace(/-/g, "")}/${recent.primaryDocument[i]}`
      });
    }

    // Flag auditor change
    filings.forEach(f => {
      if (
        f.reason.toLowerCase().includes("auditor") ||
        f.form === "8-K" && f.reason.toLowerCase().includes("accounting")
      ) {
        f.reason = "Recent Auditor Change";
        f.flagged = true;
      }
    });

    return filings;
  } catch {
    return [];
  }
}

function computeSqueezeRisk(data: any) {
  let score = 0;
  if (data.shortFloat > 20) score += 30;
  if (data.floatTurnover > 10) score += 25;
  if (data.insiderOwn < 5) score += 15;
  if (data.instOwn < 10) score += 20;
  return Math.min(100, score);
}

export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  try {
    // === Market + fundamentals ===
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "majorHoldersBreakdown"]
    });

    const price = quote.price?.regularMarketPrice || 0;
    const volume = quote.price?.regularMarketVolume || 0;
    const marketCap = quote.price?.marketCap || 100_000_000;
    const sharesOutstanding = quote.defaultKeyStatistics?.sharesOutstanding || 50_000_000;
    const floatShares = quote.defaultKeyStatistics?.floatShares || 40_000_000;
    const shortFloat = quote.defaultKeyStatistics?.shortPercentOfFloat
      ? quote.defaultKeyStatistics.shortPercentOfFloat * 100
      : 25;
    const instOwn = quote.majorHoldersBreakdown?.institutionsPercentHeld
      ? quote.majorHoldersBreakdown.institutionsPercentHeld * 100
      : 12;
    const insiderOwn = quote.majorHoldersBreakdown?.insidersPercentHeld
      ? quote.majorHoldersBreakdown.insidersPercentHeld * 100
      : 5;

    // === History (last 30d) ===
    const historyData = await yahooFinance.chart(ticker, {
      range: "1mo",
      interval: "1d"
    });
    const history = historyData.quotes.map((q: any) => ({
      date: q.date.toISOString().split("T")[0],
      close: q.close,
      volume: q.volume
    }));

    // === Spike detection ===
    let sudden_price_spike = false;
    if (history.length >= 10) {
      const lastClose = history[history.length - 1].close;
      const lastVol = history[history.length - 1].volume;

      const window = history.slice(-10);
      const closes = window.map(d => d.close);
      const vols = window.map(d => d.volume);

      const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
      const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;

      const sorted = [...closes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianClose = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

      if (lastClose >= medianClose * 2) {
        sudden_price_spike = true;
      } else if (lastClose >= avgClose * 1.5 && lastVol >= avgVol * 2) {
        sudden_price_spike = true;
      }
    }

    // === Volume spike ===
    let sudden_volume_spike = false;
    if (history.length >= 5) {
      const lastVol = history[history.length - 1].volume;
      const avgVol = history.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;
      sudden_volume_spike = lastVol > avgVol * 2;
    }

    // === SEC filings ===
    let sec_flags: any[] = [];
    if (quote.price?.exchange === "NMS") {
      const cik = quote.price.symbol?.cik || null;
      if (cik) {
        sec_flags = await fetchFilings(cik);
      }
    }

    // === Risk Score ===
    const squeezeRiskScore = computeSqueezeRisk({
      shortFloat,
      floatTurnover: (volume / floatShares) * 100,
      insiderOwn,
      instOwn
    });

    return NextResponse.json({
      ticker,
      last_price: price,
      latest_volume: volume,
      marketCap,
      sharesOutstanding,
      floatShares,
      shortFloat,
      instOwn,
      insiderOwn,
      floatTurnover: (volume / floatShares) * 100,
      sudden_price_spike,
      sudden_volume_spike,
      valuation_fundamentals_mismatch: marketCap > 1e9 && price < 1,
      no_fundamental_news: false, // placeholder
      reverse_split_or_dilution: false, // placeholder
      recent_auditor_change: sec_flags.some(f => f.flagged),
      insider_or_major_holder_selloff: false, // placeholder
      rapid_social_acceleration: false, // now manual
      social_media_promotion: false, // now manual
      whatsapp_or_vip_group: false, // now manual
      sec_flags,
      squeezeRiskScore,
      squeezeLabel:
        squeezeRiskScore >= 80 ? "Extreme" :
        squeezeRiskScore >= 60 ? "High" :
        squeezeRiskScore >= 40 ? "Elevated" :
        "Low",
      history
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
