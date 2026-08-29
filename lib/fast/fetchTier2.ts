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

/** Polygon ticker overview + optional Finnhub profile — Edge-safe (replaces brittle Yahoo). */
export async function fetchPolygonFundamentals(ticker: string): Promise<FundamentalsData> {
  const key = process.env.POLYGON_API_KEY;
  if (!key) throw new Error('POLYGON_API_KEY missing');

  const url = `https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`polygon ticker ${res.status}`);
  const json = await res.json();
  const r = json?.results;
  if (!r) throw new Error('polygon ticker empty');

  let marketCap = typeof r.market_cap === 'number' ? r.market_cap : null;
  let floatShares =
    normalizeShareCount(r.weighted_shares_outstanding) ??
    normalizeShareCount(r.share_class_shares_outstanding) ??
    null;
  let sharesOutstanding = normalizeShareCount(r.share_class_shares_outstanding) ?? null;

  // Finnhub profile2 fills gaps (market cap in millions, shares in millions)
  const finnhubKey = process.env.FINNHUB_API_KEY;
  if (finnhubKey) {
    try {
      const fRes = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${finnhubKey}`,
        { cache: 'no-store' }
      );
      if (fRes.ok) {
        const f = (await fRes.json()) as {
          marketCapitalization?: number;
          shareOutstanding?: number;
        };
        if (marketCap == null && typeof f.marketCapitalization === 'number') {
          marketCap = f.marketCapitalization * 1_000_000;
        }
        if (floatShares == null && typeof f.shareOutstanding === 'number') {
          floatShares = f.shareOutstanding * 1_000_000;
        }
        if (sharesOutstanding == null && typeof f.shareOutstanding === 'number') {
          sharesOutstanding = f.shareOutstanding * 1_000_000;
        }
      }
    } catch {
      // optional enrichment — polygon result stands on its own
    }
  }

  if (marketCap == null && floatShares == null) {
    throw new Error('polygon fundamentals empty');
  }

  return {
    marketCap,
    float: floatShares,
    instOwn: null,
    shortInterest: null,
    sharesOutstanding,
  };
}

/**
 * @deprecated Yahoo quoteSummary returns 401 on Edge — use fetchPolygonFundamentals.
 */
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
  const upper = ticker.toUpperCase();

  const cikRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': SEC_UA, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!cikRes.ok) throw new Error(`sec cik list ${cikRes.status}`);

  const cikJson = (await cikRes.json()) as Record<
    string,
    { ticker?: string; cik_str?: number }
  >;
  const entry = Object.values(cikJson).find((c) => c.ticker?.toUpperCase() === upper);
  if (!entry?.cik_str) throw new Error(`sec cik not found for ${upper}`);

  const cik = String(entry.cik_str).padStart(10, '0');
  const secRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': SEC_UA, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!secRes.ok) throw new Error(`sec submissions ${secRes.status}`);

  const secJson = (await secRes.json()) as {
    filings?: { recent?: { form?: string[]; filingDate?: string[] } };
  };
  const recent = secJson.filings?.recent;
  const forms = recent?.form ?? [];
  const dates = recent?.filingDate ?? [];

  const filings: FilingItem[] = [];
  let daysSinceLast: number | null = null;
  const now = Date.now();

  for (let i = 0; i < Math.min(forms.length, 40); i++) {
    const form = (forms[i] || '').toUpperCase();
    const dateStr = dates[i];
    if (!dateStr) continue;

    const filedAt = new Date(dateStr).toISOString();
    const ageDays = (now - new Date(dateStr).getTime()) / (86400 * 1000);
    const ageFloor = Math.floor(ageDays);
    if (daysSinceLast == null || ageFloor < daysSinceLast) daysSinceLast = ageFloor;

    if (ageDays <= 2) {
      filings.push({ form, filedAt, signal: classifyForm(form) });
    }
  }

  return { filings, daysSinceLast, cik };
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
      settleSource('polygon-fundamentals', Math.min(ms, 1200), () =>
        fetchPolygonFundamentals(ticker)
      ),
      settleSource('sec-filings', Math.min(ms, 1200), () => fetchSecFilings(ticker)),
      settleSource('borrow', Math.min(ms, 1000), () => fetchBorrow(ticker)),
      settleSource('news', Math.min(ms, 1000), () => fetchNewsBundle(ticker)),
      // Dedicated 200ms budget — never block the hot path on a slow KV miss
      settleSource('droppiness-kv', 200, () => fetchDroppinessCached(ticker)),
    ]);

  return { snapshot, bars, fundamentals, filings, borrow, news, droppiness };
}
