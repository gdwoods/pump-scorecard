import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

// Ensure Node runtime + no caching for fresh social/news
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Helper: word counter ===
function countOccurrences(text: string, words: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const lower = text.toLowerCase();
  for (const w of words) {
    const re = new RegExp(`\\b${w.toLowerCase()}\\b`, 'g');
    const m = lower.match(re);
    out[w] = m ? m.length : 0;
  }
  return out;
}

// Small helper to fetch text safely with no-store
async function fetchText(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return await r.text();
}
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return await r.json() as T;
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

    // (SEC scan, News, Social Media, Finviz, etc.)
    // ... keep your existing logic here unchanged ...

    return NextResponse.json({
      ticker: tkr,
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      history,
      // ... include the rest of your computed fields ...
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'scan failed' },
      { status: 500 }
    );
  }
}

// Fix for Vercel TypeScript build
export {};