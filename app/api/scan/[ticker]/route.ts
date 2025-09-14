import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Helper: safe fetch
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
    }));

    // === SEC filings ===
    let sec_flags: Array<{ form: string; date: string; reasons: string[]; url?: string; scoreImpact: number }> = [];
    let secScore = 0;

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
          const url = acc ? `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${acc}/${docs[i]}` : undefined;

          const reasons: string[] = [];
          let scoreImpact = 0;

          if (/S-1|S-3|F-1|F-3|424[BH]/.test(form)) {
            reasons.push('Registration / Shelf (dilution risk)');
            scoreImpact += 20;
          }
          if (form === '4') {
            reasons.push('Insider transaction (Form 4)');
            scoreImpact += 10;
          }
          if (form === '8-K' && url) {
            try {
              const text = await fetchText(url, headers);
              if (/certifying accountant/i.test(text)) {
                reasons.push('Auditor change');
                scoreImpact += 10;
              }
              if (/reverse stock split/i.test(text)) {
                reasons.push('Reverse split');
                scoreImpact += 20;
              }
            } catch {}
          }

          if (reasons.length > 0) {
            sec_flags.push({ form, date: filingDate, reasons, url, scoreImpact });
            secScore += scoreImpact;
          }
        }
      }
    } catch (e) {
      console.error('SEC scan error:', e);
    }

    // === Ownership (Finviz) + Squeeze Risk ===
    let shortFloat = null, insiderOwn = null, instOwn = null;
    try {
      const html = await fetchText(`https://finviz.com/quote.ashx?t=${tkr}`, {
        'User-Agent': 'Mozilla/5.0',
      });
      const getValue = (label: string): string | null => {
        const regex = new RegExp(`<td[^>]*>${label}<\\/td>\\s*<td[^>]*>(.*?)<\\/td>`, 'i');
        const match = html.match(regex);
        return match?.[1]?.replace(/<.*?>/g, '').trim() ?? null;
      };
      const parsePct = (v: string | null): number | null => {
        if (!v) return null;
        const n = parseFloat(v.replace('%', ''));
        return isNaN(n) ? null : n;
      };
      shortFloat = parsePct(getValue('Short Float'));
      insiderOwn = parsePct(getValue('Insider Own'));
      instOwn = parsePct(getValue('Inst Own'));
    } catch (e) {
      console.error('Finviz error:', e);
    }

    let squeezeRiskScore = 0;
    if ((shortFloat ?? 0) > 20) squeezeRiskScore += 40;
    if ((quote.floatShares && latest.volume / quote.floatShares > 0.3)) squeezeRiskScore += 30;
    if ((quote.floatShares ?? 0) < 5_000_000 && (quote.marketCap ?? 0) < 200_000_000) squeezeRiskScore += 30;

    squeezeRiskScore += secScore;

    // ✅ cap at 100
    const cappedScore = Math.min(squeezeRiskScore, 100);

    let squeezeLabel = 'Low';
    if (cappedScore >= 80) squeezeLabel = '🔥 Extreme';
    else if (cappedScore >= 60) squeezeLabel = '⚠️ Elevated';
    else if (cappedScore >= 40) squeezeLabel = 'Moderate';

    // === Response ===
    return NextResponse.json({
      ticker: tkr,
      sudden_volume_spike,
      sudden_price_spike,
      valuation_fundamentals_mismatch,
      last_price: latest.close,
      avg_volume: avgVol,
      latest_volume: latest.volume,
      marketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      floatShares: quote.floatShares ?? quote.sharesOutstanding ?? null,
      shortFloat,
      insiderOwn,
      instOwn,
      squeezeRiskScore: cappedScore,
      squeezeLabel,
      secScore,
      sec_flags,
      history,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'scan failed' }, { status: 500 });
  }
}

// keep file a module
export {};
