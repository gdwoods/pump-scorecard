import { NextResponse } from 'next/server';
import yahooFinance from 'yahoo-finance2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const padCIK = (cik: number | string) => cik.toString().padStart(10, '0');

// === SEC LOOKUP HELPERS ===
let tickerMap: Record<string, { cik_str: number, ticker: string, title: string }> | null = null;

async function loadTickerMap() {
  if (!tickerMap) {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': 'PumpScorecard/1.0 (email@example.com)' },
      cache: 'no-store'
    });
    tickerMap = await res.json();
  }
  return tickerMap!;
}

async function getCIK(ticker: string): Promise<string | null> {
  const map = await loadTickerMap();
  const match = Object.values(map).find(
    (v: any) => v.ticker?.toUpperCase() === ticker.toUpperCase()
  );
  return match ? padCIK(match.cik_str) : null;
}

// === Filing parser ===
function parseFilingText(text: string): string[] {
  const lower = text.toLowerCase();
  const reasons: string[] = [];

  if (lower.includes('going concern') || lower.includes('substantial doubt'))
    reasons.push('Going concern risk');
  if (lower.includes('reverse stock split'))
    reasons.push('Reverse split');
  if (lower.includes('equity line') || lower.includes('at-the-market') || lower.includes('atm program'))
    reasons.push('ATM / shelf offering');
  if (lower.includes('convertible') || lower.includes('warrants') || lower.includes('registered direct'))
    reasons.push('Dilution financing');
  if (lower.includes('auditor resigned') || lower.includes('change in accountants'))
    reasons.push('Auditor change');
  if (lower.includes('unregistered sale of equity'))
    reasons.push('Unregistered equity sale');

  return reasons;
}

function scoreReasons(reasons: string[]): number {
  let score = 0;
  for (const r of reasons) {
    if (r.includes('Going concern')) score += 30;
    else if (r.includes('ATM') || r.includes('Dilution')) score += 25;
    else if (r.includes('Reverse split')) score += 20;
    else if (r.includes('Unregistered')) score += 15;
    else if (r.includes('Auditor')) score += 15;
    else if (r.includes('Recent S-')) score += 10;
  }
  return score;
}

async function fetchFilings(cik: string) {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': 'PumpScorecard/1.0 (email@example.com)' },
    cache: 'no-store'
  });
  if (!res.ok) return [];
  const data = await res.json();

  const filings = data.filings?.recent || {};
  const forms: string[] = filings.form || [];
  const dates: string[] = filings.filingDate || [];
  const accNums: string[] = filings.accessionNumber || [];
  const docs: string[] = filings.primaryDocument || [];

  const risky = ['S-1','S-3','424B','8-K','10-K','10-Q'];
  const flags: any[] = [];

  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    if (risky.some(r => f.startsWith(r))) {
      const url = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accNums[i].replace(/-/g,'')}/${docs[i]}`;
      let reasons: string[] = [`Recent ${f} filing`];

      try {
        const filingRes = await fetch(url, {
          headers: { 'User-Agent': 'PumpScorecard/1.0 (email@example.com)' },
          cache: 'no-store'
        });
        if (filingRes.ok) {
          const text = await filingRes.text();
          reasons = [...reasons, ...parseFilingText(text)];
        }
      } catch {}

      flags.push({
        date: dates[i],
        form: f,
        url,
        reasons,
        scoreImpact: scoreReasons(reasons)
      });
    }
  }
  return flags;
}

// === API handler ===
export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } }
) {
  try {
    const tkr = params.ticker.toUpperCase();

    // Price / volume
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

    // SEC filings + score
    let sec_flags: any[] = [];
    let secScore = 0;
    const cik = await getCIK(tkr);
    if (cik) {
      sec_flags = await fetchFilings(cik);
      secScore = sec_flags.reduce((s, f) => s + (f.scoreImpact || 0), 0);
    }

    // Base squeeze risk scoring (from float/volume/short)
    let squeezeRiskScore = 0;
    if ((quote.shortPercentOfFloat ?? 0) > 20) squeezeRiskScore += 40;
    if ((quote.floatShares && latest.volume / quote.floatShares > 0.3)) squeezeRiskScore += 30;
    if ((quote.floatShares ?? 0) < 5_000_000 && (quote.marketCap ?? 0) < 200_000_000) squeezeRiskScore += 30;

    // Add SEC scoring
    squeezeRiskScore += secScore;

    let squeezeLabel = 'Low';
    if (squeezeRiskScore >= 120) squeezeLabel = '🔥 Extreme';
    else if (squeezeRiskScore >= 80) squeezeLabel = '⚠️ Elevated';
    else if (squeezeRiskScore >= 50) squeezeLabel = 'Moderate';

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
      floatShares: quote.floatShares,
      shortFloat: quote.shortPercentOfFloat,
      instOwn: quote.institutionPercentHeld,
      insiderOwn: quote.insiderPercentHeld,
      history,
      sec_flags,
      secScore,
      squeezeRiskScore,
      squeezeLabel,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'scan failed' },
      { status: 500 }
    );
  }
}

export {};
