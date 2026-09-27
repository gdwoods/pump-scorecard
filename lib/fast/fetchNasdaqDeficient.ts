// lib/fast/fetchNasdaqDeficient.ts
// Nasdaq daily noncompliant (deficient) list. Direct fetch first; Vercel Edge
// often gets blocked, so fall back to the Node /api/nasdaq-deficient proxy.

import type { NasdaqListing } from './types';

export const NASDAQ_NONCOMPLIANT_PAGE =
  'https://www.nasdaq.com/market-activity/stocks/non-compliant-company-list';

export const NASDAQ_DEFICIENT_API =
  'https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient';

const MEM_TTL_MS = 10 * 60 * 1000;

const NASDAQ_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/market-activity/stocks/non-compliant-company-list',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

type MemCache = { expires: number; index: Map<string, NasdaqListing> };
let mem: MemCache | null = null;

type NasdaqCompanyRow = {
  Deficiency?: string;
  Market?: string;
  NotificationDate?: string;
  AffectedIssues?: string[];
};

type NasdaqIssuerRow = {
  IssuerName?: string;
  companies?: NasdaqCompanyRow[];
};

export function nasdaqListingUnavailable(): NasdaqListing {
  return {
    status: 'unavailable',
    deficiencies: [],
    sourceUrl: NASDAQ_NONCOMPLIANT_PAGE,
  };
}

export function formatNasdaqDeficiencySummary(listing: NasdaqListing): string {
  return listing.deficiencies
    .map((d) =>
      d.notificationDate ? `${d.type} (${d.notificationDate})` : d.type
    )
    .filter((s) => s.trim().length > 0)
    .join('; ');
}

export function nasdaqNoncompliantFlag(
  listing: NasdaqListing | null | undefined
): string | null {
  if (!listing || listing.status !== 'noncompliant') return null;
  const summary = formatNasdaqDeficiencySummary(listing);
  return summary
    ? `Nasdaq noncompliant — ${summary}`
    : 'Nasdaq noncompliant';
}

export function appendNasdaqListingFlag(
  flags: string[],
  listing: NasdaqListing | null | undefined
): string[] {
  const flag = nasdaqNoncompliantFlag(listing);
  if (!flag) return flags;
  if (flags.some((f) => f.startsWith('Nasdaq noncompliant'))) return flags;
  return [...flags, flag];
}

export function parseNasdaqDeficientPayload(
  json: unknown
): Map<string, NasdaqListing> {
  const index = new Map<string, NasdaqListing>();
  const root = json as {
    data?: { noncomplaintCompanyList?: { rows?: NasdaqIssuerRow[] } };
  };
  const rows = root?.data?.noncomplaintCompanyList?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('nasdaq deficient list empty');
  }

  for (const row of rows) {
    const issuerName = row.IssuerName?.trim() || null;
    const companies = row.companies;
    if (!Array.isArray(companies)) continue;

    for (const company of companies) {
      const issues = company.AffectedIssues;
      if (!Array.isArray(issues)) continue;
      const type = String(company.Deficiency ?? '').trim();
      const notificationDate = String(company.NotificationDate ?? '').trim();
      const market = company.Market ? String(company.Market).trim() : null;
      const def = { type, notificationDate };

      for (const raw of issues) {
        const symbol = String(raw ?? '')
          .trim()
          .toUpperCase();
        if (!symbol) continue;

        const existing = index.get(symbol);
        if (!existing) {
          index.set(symbol, {
            status: 'noncompliant',
            issuerName,
            market,
            deficiencies: [def],
            sourceUrl: NASDAQ_NONCOMPLIANT_PAGE,
          });
          continue;
        }

        const dup = existing.deficiencies.some(
          (d) => d.type === def.type && d.notificationDate === def.notificationDate
        );
        if (!dup) existing.deficiencies.push(def);
        if (!existing.issuerName && issuerName) existing.issuerName = issuerName;
        if (!existing.market && market) existing.market = market;
      }
    }
  }

  if (index.size === 0) {
    throw new Error('nasdaq deficient list empty');
  }

  return index;
}

export function listingFromIndex(
  index: Map<string, NasdaqListing>,
  ticker: string
): NasdaqListing {
  const hit = index.get(ticker.trim().toUpperCase());
  return (
    hit ?? {
      status: 'not_listed',
      deficiencies: [],
      sourceUrl: NASDAQ_NONCOMPLIANT_PAGE,
    }
  );
}

export function indexToRecord(
  index: Map<string, NasdaqListing>
): Record<string, NasdaqListing> {
  return Object.fromEntries(index);
}

export function indexFromRecord(
  record: Record<string, NasdaqListing>
): Map<string, NasdaqListing> {
  return new Map(Object.entries(record));
}

function remember(index: Map<string, NasdaqListing>): Map<string, NasdaqListing> {
  mem = { expires: Date.now() + MEM_TTL_MS, index };
  return index;
}

function isVercelEdge(): boolean {
  return Boolean(process.env.VERCEL) && process.env.NEXT_RUNTIME === 'edge';
}

/** Upstream Nasdaq fetch. Safe to call from Node; Edge is blocked / times out. */
export async function fetchNasdaqFromNasdaqDotCom(
  timeoutMs?: number
): Promise<Map<string, NasdaqListing>> {
  const res = await fetch(NASDAQ_DEFICIENT_API, {
    headers: NASDAQ_HEADERS,
    cache: 'no-store',
    ...(timeoutMs != null ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) throw new Error(`nasdaq deficient ${res.status}`);
  const json: unknown = await res.json();
  return parseNasdaqDeficientPayload(json);
}

/** Cached origin fetch for the Node proxy. */
export async function fetchNasdaqFromNasdaqDotComCached(): Promise<
  Map<string, NasdaqListing>
> {
  const now = Date.now();
  if (mem && mem.expires > now) return mem.index;
  return remember(await fetchNasdaqFromNasdaqDotCom());
}

function internalNasdaqUrl(ticker?: string): string | null {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const host = explicit || (vercel ? `https://${vercel.replace(/^https?:\/\//, '')}` : null);
  if (!host) return null;
  const base = `${host}/api/nasdaq-deficient`;
  if (!ticker) return base;
  return `${base}?ticker=${encodeURIComponent(ticker)}`;
}

async function fetchNasdaqListingFromInternalApi(ticker: string): Promise<NasdaqListing> {
  const url = internalNasdaqUrl(ticker);
  if (!url) throw new Error('nasdaq deficient proxy url missing');
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`nasdaq deficient proxy ${res.status}`);
  const json = (await res.json()) as {
    listing?: NasdaqListing;
    listings?: Record<string, NasdaqListing>;
  };
  if (json.listing?.status) return json.listing;
  if (json.listings) return listingFromIndex(indexFromRecord(json.listings), ticker);
  throw new Error('nasdaq deficient proxy empty');
}

export async function fetchNasdaqDeficientIndex(): Promise<
  Map<string, NasdaqListing>
> {
  const now = Date.now();
  if (mem && mem.expires > now) return mem.index;
  return remember(await fetchNasdaqFromNasdaqDotCom());
}

export async function lookupNasdaqDeficient(ticker: string): Promise<NasdaqListing> {
  const now = Date.now();
  if (mem && mem.expires > now) return listingFromIndex(mem.index, ticker);

  // Vercel Edge cannot reach api.nasdaq.com; a direct 800ms abort also ate the
  // budget before the Node proxy could answer. Ask the Node route instead.
  if (isVercelEdge()) {
    try {
      return await fetchNasdaqListingFromInternalApi(ticker);
    } catch (err) {
      console.warn(
        'nasdaq deficient proxy failed',
        err instanceof Error ? err.message : err
      );
      throw err;
    }
  }

  const index = await fetchNasdaqDeficientIndex();
  return listingFromIndex(index, ticker);
}
