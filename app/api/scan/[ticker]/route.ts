import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// --- Helpers ---
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return (await r.json()) as T;
}
async function fetchText(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return await r.text();
}

// --- API Handler ---
export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // === Price & Volume (Yahoo) ===
    const quote = await yahooFinance.quote(tkr);
    const chart = await yahooFinance.chart(tkr, {
      period1: new Date(Date.now() - 14 * 86400 * 1000),
      period2: new Date(),
      interval: '1d',
    });

    const quotes = chart.quotes || [];
    if (!quotes.length) {
      return NextResponse.json({ error: 'No price data' }, { status: 404 });
    }

    const latest = quotes.at(-1)!;
    const prev = quotes.at(-2) ?? latest;
    const avgVol = quotes.reduce((s, q) => s + (q.volume || 0), 0) / (quotes.length || 1);
    const minClose = Math.min(...quotes.map((q) => q.close));

    // === Auto signals ===
    const sudden_volume_spike = !!latest.volume && latest.volume > avgVol * 3;
    const sudden_price_spike =
      latest.close > (prev?.close || latest.close) * 1.3 ||
      latest.close > minClose * 2;
    const valuation_fundamentals_mismatch = !quote.trailingPE || quote.trailingPE > 100;
    const no_fundamental_news = sudden_price_spike; // fallback until we add news scan

    const history = quotes.map((q) => ({
      date: q.date?.toISOString().split('T')[0] || '',
      close: q.close,
      volume: q.volume,
      pctFromMin: ((q.close - minClose) / minClose) * 100,
      spike: q.close > minClose * 2,
    }));

    // === SEC filings (EDGAR) ===
    let sec_flags: Array<{ form: string; date: string; reason: string; url?: string }> = [];
    try {
      const headers = { 'User-Agent': 'pump-scorecard/1.0 (edu use)' };
      const cikMap: any = await fetchJson('https://www.sec.gov/files/company_tickers.json', headers);
      const entry = Object.values<any>(cikMap).find((c: any) => c.ticker?.toUpperCase() === tkr);

      if (entry?.cik_str) {
        const cik10 = entry.cik_str.toString().padStart(10, '0');
        const subs: any = await fetchJson(`https://data.sec.gov/submissions/CIK${cik10}.json`, headers);

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

          if (/S-1|S-3|F-1|F-3|424[BH]/.test(form)) {
            sec_flags.push({ form, date: filingDate, reason: 'Registration / Shelf (dilution risk)', url });
          }
          if (form === '4') {
            sec_flags.push({ form, date: filingDate, reason: 'Insider transaction (Form 4)', url });
          }
          if (form === '8-K') {
            sec_flags.push({ form, date: filingDate, reason: '8-K filing', url });
          }
        }
      }
    } catch (e) {
      console.error('SEC fetch failed:', e);
    }

    // fallback: if no filings found, mock one
    if (sec_flags.length === 0) {
      sec_flags.push({
        form: 'S-3',
        date: new Date().toISOString().split('T')[0],
        reason: 'Mock example — dilution risk',
        url: 'https://www.sec.gov/edgar/searchedgar/companysearch.html',
      });
    }

    // === Ownership & squeeze ===
    let shortFloat = null, insiderOwn = null, instOwn = null;
    try {
      shortFloat = 25; // mock %
      insiderOwn = 5;
      instOwn = 10;
    } catch {}

    let squeezeRiskScore = 0;
    if ((shortFloat ?? 0) > 20) squeezeRiskScore += 40;
    if (quote.floatShares && latest.volume / quote.floatShares > 0.3) squeezeRiskScore += 30;
    if ((quote.floatShares ?? 0) < 5_000_000 && (quote.marketCap ?? 0) < 200_000_000) squeezeRiskScore += 30;
    if (squeezeRiskScore > 100) squeezeRiskScore = 100;

    let squeezeLabel = 'Low';
    if (squeezeRiskScore >= 80) squeezeLabel = '🔥 Extreme';
    else if (squeezeRiskScore >= 60) squeezeLabel = '⚠️ Elevated';
    else if (squeezeRiskScore >= 40) squeezeLabel = 'Moderate';

    // === Response ===
    return NextResponse.json({
      ticker: tkr,

      // Auto signals
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      no_fundamental_news,

      // Market/fundamentals
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,

      // Ownership & squeeze
      shortFloat,
      insiderOwn,
      instOwn,
      squeezeRiskScore,
      squeezeLabel,

      // Price history + SEC
      history,
      sec_flags,

      // Mock social hype
      hype: {
        redditMentions: 15,
        twitterMentions: 40,
        timeline: [
          { day: '1d ago', reddit: 2, twitter: 5 },
          { day: '2d ago', reddit: 3, twitter: 7 },
          { day: '3d ago', reddit: 5, twitter: 10 },
          { day: '4d ago', reddit: 2, twitter: 6 },
          { day: '5d ago', reddit: 1, twitter: 5 },
          { day: '6d ago', reddit: 1, twitter: 4 },
          { day: '7d ago', reddit: 1, twitter: 3 },
        ],
        keywordHeatmap: { pump: 5, moon: 2, telegram: 1, whatsapp: 3, vip: 2 },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'scan failed' }, { status: 500 });
  }
}

export {};
