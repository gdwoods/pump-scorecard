import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// --- SEC helper fetch ---
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers, cache: "no-store" });
  return (await r.json()) as T;
}

export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  try {
    const tkr = params.ticker.toUpperCase();

    // === Yahoo Finance ===
    const quote = await yahooFinance.quote(tkr);
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
    const avgVol = quotes.reduce((s, q) => s + (q.volume || 0), 0) / quotes.length;
    const minClose = Math.min(...quotes.map((q) => q.close));

    const sudden_volume_spike = !!latest.volume && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev?.close || latest.close) * 1.25 ||
      latest.close > minClose * 2;
    const valuation_fundamentals_mismatch =
      !quote.trailingPE || quote.trailingPE > 100;

    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split("T")[0] || "",
      close: q.close,
      volume: q.volume,
    }));

    // === SEC filings ===
    const headers = { "User-Agent": "pump-scorecard/1.0 (edu)" };
    let sec_flags: Array<{ form: string; date: string; reason: string; url?: string }> = [];

    try {
      const cikMap: any = await fetchJson(
        "https://www.sec.gov/files/company_tickers.json",
        headers
      );
      const entry = Object.values<any>(cikMap).find(
        (c: any) => c.ticker?.toUpperCase() === tkr
      );
      if (entry?.cik_str) {
        const cik10 = entry.cik_str.toString().padStart(10, "0");
        const subs: any = await fetchJson(
          `https://data.sec.gov/submissions/CIK${cik10}.json`,
          headers
        );

        const forms: string[] = subs?.filings?.recent?.form ?? [];
        const dates: string[] = subs?.filings?.recent?.filingDate ?? [];
        const docs: string[] = subs?.filings?.recent?.primaryDocument ?? [];
        const accs: string[] = subs?.filings?.recent?.accessionNumber ?? [];

        for (let i = 0; i < forms.length && i < 15; i++) {
          const form = (forms[i] || "").toUpperCase();
          const filingDate = dates[i] || "";
          const acc = (accs[i] || "").replace(/-/g, "");
          const url = acc
            ? `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${acc}/${docs[i]}`
            : undefined;

          const pushFlag = (reason: string) =>
            sec_flags.push({ form, date: filingDate, reason, url });

          if (/S-1|S-3|F-1|F-3|424[BH]/.test(form)) {
            pushFlag("Registration / Shelf (dilution risk)");
          }
          if (form === "4") {
            pushFlag("Insider transaction (Form 4)");
          }
          if (form === "8-K") {
            pushFlag("General 8-K filing");
          }
        }
      }
    } catch (e) {
      console.error("SEC fetch error:", e);
    }

    // === Squeeze Risk Score (capped 0–100) ===
    let score = 0;
    if ((quote.shortPercentOfFloat ?? 0) > 20) score += 40;
    if ((quote.floatShares && latest.volume / quote.floatShares > 0.3)) score += 30;
    if ((quote.floatShares ?? 0) < 5_000_000 && (quote.marketCap ?? 0) < 200_000_000)
      score += 30;
    const squeezeRiskScore = Math.max(0, Math.min(100, score));

    let squeezeLabel = "Low";
    if (squeezeRiskScore >= 80) squeezeLabel = "🔥 Extreme";
    else if (squeezeRiskScore >= 60) squeezeLabel = "⚠️ Elevated";
    else if (squeezeRiskScore >= 40) squeezeLabel = "Moderate";

    return NextResponse.json({
      ticker: tkr,
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      history,
      sec_flags,
      squeezeRiskScore,
      squeezeLabel,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "scan failed" }, { status: 500 });
  }
}

// ✅ Fix TypeScript module issue
export {};
