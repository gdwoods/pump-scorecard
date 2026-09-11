// lib/fast/fetchNasdaqDeficient.ts
// Nasdaq daily noncompliant (deficient) list — Edge-safe, list-level cache.

import type { NasdaqListing } from './types';

export const NASDAQ_NONCOMPLIANT_PAGE =
  'https://www.nasdaq.com/market-activity/stocks/non-compliant-company-list';

export const NASDAQ_DEFICIENT_API =
  'https://api.nasdaq.com/api/quote/list-type-extended/listing?queryString=deficient';

const MEM_TTL_MS = 10 * 60 * 1000;

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
  if (!Array.isArray(rows)) {
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

export async function fetchNasdaqDeficientIndex(): Promise<
  Map<string, NasdaqListing>
> {
  const now = Date.now();
  if (mem && mem.expires > now) return mem.index;

  const res = await fetch(NASDAQ_DEFICIENT_API, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://www.nasdaq.com',
      Referer: 'https://www.nasdaq.com/',
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`nasdaq deficient ${res.status}`);
  const json: unknown = await res.json();
  const index = parseNasdaqDeficientPayload(json);
  mem = { expires: now + MEM_TTL_MS, index };
  return index;
}

export async function lookupNasdaqDeficient(ticker: string): Promise<NasdaqListing> {
  const index = await fetchNasdaqDeficientIndex();
  return listingFromIndex(index, ticker);
}
