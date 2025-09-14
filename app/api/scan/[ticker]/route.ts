import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// === Helper: safe fetch with no-store ===
async function fetchText(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return await r.text();
}
async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const r = await fetch(url, { headers, cache: 'no-store', next: { revalidate: 0 } });
  return (await r.json()) as T;
}

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

    // === SEC filings (simplified, still mock if SEC blocks) ===
    let sec_flags: Array<{ form: string; date: string; reason: string; url?: string }> = [];
    let reverse_split_or_dilution = false;
    let recent_auditor_change = false;
    let insider_or_major_holder_selloff = false;

    try {
      const headers = { 'User-Agent': 'pump-scorecard/1.0 (edu use)' };
      const cikMap: any = await fetchJson('https://www.sec.gov/files/company_tickers.json', headers);
      const entry = Object.values<any>(cikMap).find((c: any) => c.ticker?.toUpperCase() === tkr);
      if (entry?.cik_str) {
        const cik10 = entry.cik_str.toString().padStart(10, '0');
        const subs: any = await fetchJson(`https://data.sec.gov/submissions/CIK${cik10}.json`, headers);
        const forms: string[] = subs?.filings?.recent?.form ?? [];
        const dates: string[] = subs?.filings?.recent?.filingDate ?? [];

        for (let i = 0; i < forms.length; i++) {
          const form = (forms[i] || '').toUpperCase();
          const filingDate = dates[i] || '';

          const pushFlag = (reason: string) =>
            sec_flags.push({ form, date: filingDate, reason });

          if (/S-1|S-3|F-1|F-3|424[BH]/.test(form)) {
            reverse_split_or_dilution = true;
            pushFlag('Registration / Shelf (dilution risk)');
          }
          if (form === '4') {
            insider_or_major_holder_selloff = true;
            pushFlag('Insider transaction (Form 4)');
          }
          if (form === '8-K') {
            recent_auditor_change = true; // fallback (real parse could be added later)
            pushFlag('8-K event');
          }
        }
      }
    } catch (e) {
      console.error('SEC scan error:', e);
    }

    // === News check (Yahoo Finance search) ===
    let no_fundamental_news = false;
    try {
      const news: any = await yahooFinance.search(tkr);
      const recentNews = (news.news ?? []).filter((n: any) => {
        const dt = new Date(n.providerPublishTime * 1000);
        const isRecent = dt > new Date(Date.now() - 7 * 86400 * 1000);
        const provider = (n.provider || '').toLowerCase();
        const isWire = /prnewswire|globenewswire|businesswire/.test(provider);
        return isRecent && !isWire;
      });

      no_fundamental_news = recentNews.length === 0 && sudden_price_spike;
    } catch (e) {
      console.error('News scan error:', e);
    }

    // === Response ===
    return NextResponse.json({
      ticker: tkr,

      // Auto signals
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      no_fundamental_news,
      reverse_split_or_dilution,
      recent_auditor_change,
      insider_or_major_holder_selloff,

      // Market/fundamentals
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,

      // History + SEC
      history,
      sec_flags,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'scan failed' }, { status: 500 });
  }
}
