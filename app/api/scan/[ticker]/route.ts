import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// Node runtime
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// --- Helpers ---
async function fetchText(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, cache: 'no-store' });
  return await r.text();
}
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers, cache: 'no-store' });
  return (await r.json()) as T;
}

// --- API Route ---
export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // === Price / Volume ===
    const quote = await yahooFinance.quote(tkr);
    const chart = await yahooFinance.chart(tkr, {
      period1: new Date(Date.now() - 30 * 86400 * 1000), // 30 days
      period2: new Date(),
      interval: '1d',
    });

    const quotes = chart.quotes || [];
    if (!quotes.length)
      return NextResponse.json({ error: 'No price data' }, { status: 404 });

    const latest = quotes.at(-1)!;
    const last5 = quotes.slice(-5);
    const avgVol5 =
      last5.reduce((s, q) => s + (q.volume || 0), 0) / (last5.length || 1);
    const avgPrice5 =
      last5.reduce((s, q) => s + (q.close || 0), 0) / (last5.length || 1);
    const minClose30 = Math.min(...quotes.map((q) => q.close));

    // === SEC Filings ===
    let sec_flags: Array<{ form: string; date: string; reason: string; url?: string }> = [];
    let recent_auditor_change = false;
    let reverse_split_or_dilution = false;
    let insider_or_major_holder_selloff = false;

    try {
      const headers = { 'User-Agent': 'pump-scorecard/1.0 (edu use)' };
      const cikMap: any = await fetchJson(
        'https://www.sec.gov/files/company_tickers.json',
        headers
      );
      const entry = Object.values<any>(cikMap).find(
        (c: any) => c.ticker?.toUpperCase() === tkr
      );

      if (entry?.cik_str) {
        const cik10 = entry.cik_str.toString().padStart(10, '0');
        const subs: any = await fetchJson(
          `https://data.sec.gov/submissions/CIK${cik10}.json`,
          headers
        );
        const forms: string[] = subs?.filings?.recent?.form ?? [];
        const dates: string[] = subs?.filings?.recent?.filingDate ?? [];
        const docs: string[] = subs?.filings?.recent?.primaryDocument ?? [];
        const accs: string[] = subs?.filings?.recent?.accessionNumber ?? [];

        for (let i = 0; i < forms.length; i++) {
          const form = (forms[i] || '').toUpperCase();
          const filingDate = dates[i] || '';
          const acc = (accs[i] || '').replace(/-/g, '');
          const url = acc
            ? `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${acc}/${docs[i]}`
            : undefined;

          const pushFlag = (reason: string) =>
            sec_flags.push({ form, date: filingDate, reason, url });

          if (/S-1|S-3|F-1|F-3|424[BH]/.test(form)) {
            reverse_split_or_dilution = true;
            pushFlag('Registration / Shelf (dilution risk)');
          }
          if (form === '4') {
            insider_or_major_holder_selloff = true;
            pushFlag('Insider transaction (Form 4)');
          }
          if (form === '8-K' && url) {
            try {
              const text = await fetchText(url, headers);
              if (/auditor|accountant/i.test(text)) {
                recent_auditor_change = true;
                pushFlag('Auditor change (8-K)');
              }
              if (/reverse stock split/i.test(text)) {
                reverse_split_or_dilution = true;
                pushFlag('Reverse split (8-K)');
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error('SEC scan error:', e);
    }

    // === Evaluator: Criteria ===
    const sudden_volume_spike =
      !!latest.volume && latest.volume > avgVol5 * 3;
    const sudden_price_spike =
      latest.close > avgPrice5 * 1.5 || latest.close > minClose30 * 2;
    const valuation_fundamentals_mismatch =
      !quote.trailingPE || quote.trailingPE > 100;

    // === Ownership / squeeze ===
    let squeezeRiskScore = 0;
    if ((quote.shortRatio ?? 0) > 10) squeezeRiskScore += 40;
    if (latest.volume && quote.floatShares && latest.volume / quote.floatShares > 0.3)
      squeezeRiskScore += 30;
    if ((quote.floatShares ?? 0) < 5_000_000 && (quote.marketCap ?? 0) < 200_000_000)
      squeezeRiskScore += 30;
    if (squeezeRiskScore > 100) squeezeRiskScore = 100;

    let squeezeLabel = 'Low';
    if (squeezeRiskScore >= 80) squeezeLabel = '🔥 Extreme';
    else if (squeezeRiskScore >= 60) squeezeLabel = '⚠️ Elevated';
    else if (squeezeRiskScore >= 40) squeezeLabel = 'Moderate';

    // === History ===
    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split('T')[0] || '',
      close: q.close,
      volume: q.volume,
    }));

    // === Response ===
    return NextResponse.json({
      ticker: tkr,
      last_price: latest.close,
      latest_volume: latest.volume,
      marketCap: quote.marketCap ?? null,
      sharesOutstanding: quote.sharesOutstanding ?? null,
      floatShares: quote.floatShares ?? null,
      squeezeRiskScore,
      squeezeLabel,
      history,
      sec_flags,

      // Criteria (for UI auto-checks)
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      reverse_split_or_dilution,
      recent_auditor_change,
      insider_or_major_holder_selloff,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'scan failed' },
      { status: 500 }
    );
  }
}

// Ensure file is a module
export {};
