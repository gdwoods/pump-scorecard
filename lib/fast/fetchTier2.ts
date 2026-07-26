// lib/fast/fetchTier2.ts
// Edge-safe Tier 2 fetchers. Wrap shared utils with timeouts; do not modify shared modules.

import { T } from '@/lib/config/thresholds';
import { fetchBorrowDesk } from '@/utils/fetchBorrowDesk';
import { fetchRecentNews } from '@/utils/fetchNews';
import { normalizeShareCount } from '@/lib/normalizeShares';
import { settleSource, withTimeout, type SettledSource } from './withTimeout';
import type { DailyBar, FilingSignal } from './types';

const SEC_UA = 'pump-scorecard short-check (garthwoods@gmail.com)';

export type SnapshotData = {
  last: number | null;
  todayMovePct: number | null;
  day: { o: number; h: number; l: number; c: number; v: number } | null;
  prevDay: { o: number; h: number; l: number; c: number; v: number } | null;
  session: 'open' | 'closed';
};

export type FundamentalsData = {
  marketCap: number | null;
  float: number | null;
  instOwn: number | null; // fraction
  shortInterest: number | null; // fraction
  sharesOutstanding: number | null;
};

export type FilingItem = {
  form: string;
  filedAt: string;
  signal: FilingSignal;
};

function classifyForm(form: string): FilingSignal {
  const f = form.toUpperCase();
  if (f.startsWith('424B')) return 'CONFIRM';
  if (f === 'EFFECT') return 'CONFIRM';
  if (f === 'S-1' || f === 'S-3' || f === 'S-3ASR') return 'CONFIRM';
  if (f === '25' || f === '25-NSE') return 'CONFIRM';
  if (f.startsWith('SC 13D') || f === 'SC 13D') return 'CAUTION';
  if (f === '8-K' || f.startsWith('8-K')) return 'REVIEW';
  if (f === '4') return 'REVIEW';
  return 'REVIEW';
}

export async function fetchPolygonSnapshot(ticker: string): Promise<SnapshotData> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error('POLYGON_API_KEY missing');

  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`polygon snapshot ${res.status}`);
  const json = await res.json();
  const t = json.ticker ?? json;
  const day = t.day ?? null;
  const prevDay = t.prevDay ?? null;
  const session: 'open' | 'closed' = day && day.v > 0 ? 'open' : 'closed';

  const ref = session === 'open' ? day : prevDay;
  const last = t.lastTrade?.p ?? ref?.c ?? null;

  let todayMovePct: number | null = null;
  if (typeof t.todaysChangePerc === 'number') {
    todayMovePct = t.todaysChangePerc / 100;
  } else if (day && prevDay?.c) {
    todayMovePct = (day.h - prevDay.c) / prevDay.c;
  }

  return {
    last,
    todayMovePct,
    day: day
      ? { o: day.o, h: day.h, l: day.l, c: day.c, v: day.v }
      : null,
    prevDay: prevDay
      ? { o: prevDay.o, h: prevDay.h, l: prevDay.l, c: prevDay.c, v: prevDay.v }
      : null,
    session,
  };
}

export async function fetchPolygonDailyBars(ticker: string): Promise<DailyBar[]> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error('POLYGON_API_KEY missing');

  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - 45);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);

  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50&apiKey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`polygon aggs ${res.status}`);
  const json = await res.json();
  const results = json.results ?? [];
  return results.map((b: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
    date: new Date(b.t).toISOString().slice(0, 10),
    o: b.o,
    h: b.h,
    l: b.l,
    c: b.c,
    v: b.v,
  }));
}

/** Lightweight Yahoo quote summary via query1 — Edge-safe. */
export async function fetchYahooFundamentals(ticker: string): Promise<FundamentalsData> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,price,summaryDetail`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShortCheck/1.0)' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`yahoo quoteSummary ${res.status}`);
  const json = await res.json();
  const result = json?.quoteSummary?.result?.[0];
  if (!result) throw new Error('yahoo quoteSummary empty');

  const stats = result.defaultKeyStatistics ?? {};
  const price = result.price ?? {};
  const summary = result.summaryDetail ?? {};

  const floatRaw = stats.floatShares?.raw ?? stats.floatShares;
  const marketCap = price.marketCap?.raw ?? price.marketCap ?? null;
  const instOwn = stats.heldPercentInstitutions?.raw ?? null;
  const shortInterest =
    stats.shortPercentOfFloat?.raw ?? summary.shortPercentOfFloat?.raw ?? null;
  const sharesOutstanding =
    stats.sharesOutstanding?.raw ?? price.sharesOutstanding?.raw ?? null;

  return {
    marketCap: typeof marketCap === 'number' ? marketCap : null,
    float: normalizeShareCount(typeof floatRaw === 'number' ? floatRaw : null) ?? null,
    instOwn: typeof instOwn === 'number' ? instOwn : null,
    shortInterest: typeof shortInterest === 'number' ? shortInterest : null,
    sharesOutstanding:
      normalizeShareCount(typeof sharesOutstanding === 'number' ? sharesOutstanding : null) ??
      null,
  };
}

export async function fetchSecFilings(ticker: string): Promise<{
  filings: FilingItem[];
  daysSinceLast: number | null;
  cik: string | null;
}> {
  // Resolve CIK via SEC company_tickers — but NEVER on hot path at full size.
  // Use ticker search endpoint instead.
  const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22%22&dateRange=custom&startdt=2020-01-01&forms=8-K,424B5,S-1,S-3&tickers=${ticker}`;
  // Prefer submissions via CIK lookup from data.sec.gov tickers list cached... 
  // Fallback: use EDGAR full-text company search for recent forms.
  const companyUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=&dateb=&owner=include&count=40&output=atom`;
  const res = await fetch(companyUrl, {
    headers: { 'User-Agent': SEC_UA, Accept: 'application/atom+xml' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`sec edgar ${res.status}`);
  const xml = await res.text();

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 20);
  const filings: FilingItem[] = [];
  let daysSinceLast: number | null = null;
  const now = Date.now();

  for (const m of entries) {
    const block = m[1];
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
    const updated = block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim();
    const formMatch = title.match(/\b(\d{1,2}-K|10-Q|10-K|8-K|S-1|S-3|S-3ASR|424B\d|EFFECT|SC 13D|4)\b/i);
    const form = formMatch ? formMatch[1].toUpperCase() : title.split(' - ')[0]?.trim() || 'UNKNOWN';
    if (!updated) continue;
    const filedAt = new Date(updated).toISOString();
    const ageDays = (now - new Date(updated).getTime()) / (86400 * 1000);
    if (daysSinceLast == null || ageDays < daysSinceLast) daysSinceLast = Math.floor(ageDays);

    // today or yesterday
    if (ageDays <= 2) {
      filings.push({ form, filedAt, signal: classifyForm(form) });
    }
  }

  void searchUrl; // reserved for ATM search path
  return { filings, daysSinceLast, cik: null };
}

export async function fetchBorrow(ticker: string): Promise<{
  available: boolean | null;
  feePct: number | null;
}> {
  const data = await fetchBorrowDesk(ticker);
  const availRaw = data.available;
  let available: boolean | null = null;
  if (availRaw && availRaw !== 'N/A' && availRaw !== 'Manual Check') {
    const n = Number(String(availRaw).replace(/,/g, ''));
    available = Number.isNaN(n) ? null : n > 0;
  }
  let feePct: number | null = null;
  if (data.fee && data.fee !== 'N/A' && data.fee !== 'Manual Check') {
    const f = Number(data.fee);
    feePct = Number.isNaN(f) ? null : f;
  }
  return { available, feePct };
}

export async function fetchNewsBundle(ticker: string): Promise<{
  headline: string | null;
  ageMinutes: number | null;
  source: string | null;
  tickerRecycleWarning: boolean;
  fromCache?: boolean;
}> {
  // Prefer wire-RSS KV cache (addendum §4 source #7) — 200ms budget
  try {
    const { readTickerNews, isNewsFresh } = await import('@/lib/wireNews/kv');
    const cached = await withTimeout(
      readTickerNews(ticker),
      200,
      'news-kv'
    );
    if (cached && isNewsFresh(cached) && cached.items.length > 0) {
      const newest = cached.items[0];
      const ageMinutes = newest.date
        ? Math.round((Date.now() - new Date(newest.date).getTime()) / 60000)
        : null;
      const threeYearsMs = 3 * 365 * 86400 * 1000;
      const tickerRecycleWarning = cached.items.some((it) => {
        const t = new Date(it.date).getTime();
        return Number.isFinite(t) && Date.now() - t > threeYearsMs;
      });
      return {
        headline: newest.headline ?? null,
        ageMinutes,
        source: newest.source ?? cached.sources[0] ?? 'wire-kv',
        tickerRecycleWarning,
        fromCache: true,
      };
    }
  } catch {
    // miss / timeout / KV unavailable → live fallback
  }

  const items = await fetchRecentNews(ticker);
  if (!items.length) {
    return { headline: null, ageMinutes: null, source: null, tickerRecycleWarning: false };
  }

  const newest = items[0];
  const ageMinutes = newest.date
    ? Math.round((Date.now() - new Date(newest.date).getTime()) / 60000)
    : null;

  // Crude recycle heuristic: any item older than 3 years while newest is recent
  const threeYearsMs = 3 * 365 * 86400 * 1000;
  const tickerRecycleWarning = items.some((it) => {
    const t = new Date(it.date).getTime();
    return Number.isFinite(t) && Date.now() - t > threeYearsMs;
  });

  return {
    headline: newest.headline ?? null,
    ageMinutes,
    source: newest.source ?? newest.publisher ?? null,
    tickerRecycleWarning,
    fromCache: false,
  };
}

export async function fetchDroppinessCached(ticker: string) {
  try {
    const { readDroppiness } = await import('@/lib/droppiness/kv');
    return await withTimeout(readDroppiness(ticker), 200, 'drop-kv');
  } catch {
    return null;
  }
}

export type Tier2Bundle = {
  snapshot: SettledSource<SnapshotData>;
  bars: SettledSource<DailyBar[]>;
  fundamentals: SettledSource<FundamentalsData>;
  filings: SettledSource<Awaited<ReturnType<typeof fetchSecFilings>>>;
  borrow: SettledSource<Awaited<ReturnType<typeof fetchBorrow>>>;
  news: SettledSource<Awaited<ReturnType<typeof fetchNewsBundle>>>;
  droppiness: SettledSource<Awaited<ReturnType<typeof fetchDroppinessCached>>>;
};

export async function fetchAllTier(ticker: string): Promise<Tier2Bundle> {
  const ms = T.timeouts.perSourceMs;
  const [snapshot, bars, fundamentals, filings, borrow, news, droppiness] =
    await Promise.all([
      settleSource('polygon-snapshot', Math.min(ms, 800), () => fetchPolygonSnapshot(ticker)),
      settleSource('polygon-aggs', Math.min(ms, 1000), () => fetchPolygonDailyBars(ticker)),
      settleSource('yahoo-fundamentals', Math.min(ms, 1200), () => fetchYahooFundamentals(ticker)),
      settleSource('sec-filings', Math.min(ms, 1200), () => fetchSecFilings(ticker)),
      settleSource('borrow', Math.min(ms, 1000), () => fetchBorrow(ticker)),
      settleSource('news', Math.min(ms, 1000), () => fetchNewsBundle(ticker)),
      // Dedicated 200ms budget — never block the hot path on a slow KV miss
      settleSource('droppiness-kv', 200, () => fetchDroppinessCached(ticker)),
    ]);

  return { snapshot, bars, fundamentals, filings, borrow, news, droppiness };
}
