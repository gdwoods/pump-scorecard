// lib/fast/fetchRegSho.ts
// Nasdaq Trader Regulation SHO threshold list. Direct file fetch first; Vercel
// Edge may be blocked, so fall back to the Node /api/regsho-threshold proxy.

import type { RegShoListing } from './types';

export const REGSHO_PAGE =
  'https://www.nasdaqtrader.com/trader.aspx?id=RegSHOThreshold';

const FILE_BASE = 'https://www.nasdaqtrader.com/dynamic/symdir/regsho';
const MEM_TTL_MS = 10 * 60 * 1000;
const DATE_LOOKBACK_DAYS = 7;

const REGSHO_HEADERS = {
  Accept: 'text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: REGSHO_PAGE,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const MARKET_LABEL: Record<string, string> = {
  Q: 'NGS',
  G: 'NGM',
  S: 'NCM',
};

type MemCache = { expires: number; index: Map<string, RegShoListing> };
let mem: MemCache | null = null;

export function regShoUnavailable(): RegShoListing {
  return {
    status: 'unavailable',
    sourceUrl: REGSHO_PAGE,
  };
}

export function formatRegShoMarket(code: string | null | undefined): string | null {
  if (!code) return null;
  const trimmed = code.trim().toUpperCase();
  return MARKET_LABEL[trimmed] ?? trimmed;
}

export function formatRegShoSummary(listing: RegShoListing): string {
  const parts = [
    listing.securityName?.trim(),
    formatRegShoMarket(listing.marketCategory),
    listing.tradeDate ? `as of ${listing.tradeDate}` : null,
  ].filter((s): s is string => Boolean(s && s.length > 0));
  return parts.join(' · ');
}

export function regShoFlag(listing: RegShoListing | null | undefined): string | null {
  if (!listing || listing.status !== 'threshold') return null;
  const summary = formatRegShoSummary(listing);
  return summary ? `Reg SHO threshold — ${summary}` : 'Reg SHO threshold';
}

export function appendRegShoFlag(
  flags: string[],
  listing: RegShoListing | null | undefined
): string[] {
  const flag = regShoFlag(listing);
  if (!flag) return flags;
  if (flags.some((f) => f.startsWith('Reg SHO threshold'))) return flags;
  return [...flags, flag];
}

function easternParts(daysAgo: number): { ymd: string; weekday: string } {
  const d = new Date(Date.now() - daysAgo * 86400000);
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(d);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  return { ymd, weekday };
}

export function candidateRegShoTradeDates(lookbackDays = DATE_LOOKBACK_DAYS): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 14 && dates.length < lookbackDays; i++) {
    const { ymd, weekday } = easternParts(i);
    if (weekday === 'Sat' || weekday === 'Sun') continue;
    dates.push(ymd);
  }
  return dates;
}

function compactYmd(ymd: string): string {
  return ymd.replaceAll('-', '');
}

function fileUrlForDate(ymd: string): string {
  return `${FILE_BASE}/nasdaqth${compactYmd(ymd)}.txt`;
}

export function parseRegShoFile(text: string, tradeDate: string): Map<string, RegShoListing> {
  if (!/symbol\s*\|/i.test(text)) {
    throw new Error('regsho list not a threshold file');
  }

  const index = new Map<string, RegShoListing>();
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^symbol\s*\|/i.test(line)) continue;
    if (/^\d{14}$/.test(line)) continue;

    const cols = line.split('|').map((c) => c.trim());
    if (cols.length < 5) continue;
    const symbol = (cols[0] ?? '').toUpperCase();
    if (!symbol || !/^[A-Z][A-Z0-9./]{0,9}$/.test(symbol)) continue;

    const flag = (cols[3] ?? '').toUpperCase();
    if (flag && flag !== 'Y') continue;

    index.set(symbol, {
      status: 'threshold',
      securityName: cols[1] || null,
      marketCategory: cols[2] || null,
      tradeDate,
      rule3210: cols[4] || null,
      sourceUrl: REGSHO_PAGE,
    });
  }

  if (index.size === 0) {
    throw new Error('regsho list empty');
  }
  return index;
}

export function listingFromRegShoIndex(
  index: Map<string, RegShoListing>,
  ticker: string
): RegShoListing {
  const hit = index.get(ticker.trim().toUpperCase());
  return (
    hit ?? {
      status: 'not_listed',
      sourceUrl: REGSHO_PAGE,
      tradeDate: [...index.values()][0]?.tradeDate ?? null,
    }
  );
}

export function regShoIndexToRecord(
  index: Map<string, RegShoListing>
): Record<string, RegShoListing> {
  return Object.fromEntries(index);
}

export function regShoIndexFromRecord(
  record: Record<string, RegShoListing>
): Map<string, RegShoListing> {
  return new Map(Object.entries(record));
}

function remember(index: Map<string, RegShoListing>): Map<string, RegShoListing> {
  mem = { expires: Date.now() + MEM_TTL_MS, index };
  return index;
}

async function fetchRegShoFile(
  ymd: string,
  timeoutMs?: number
): Promise<Map<string, RegShoListing>> {
  const res = await fetch(fileUrlForDate(ymd), {
    headers: REGSHO_HEADERS,
    cache: 'no-store',
    redirect: 'manual',
    ...(timeoutMs != null ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`regsho ${ymd} redirect ${res.status}`);
  }
  if (!res.ok) throw new Error(`regsho ${ymd} ${res.status}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) throw new Error(`regsho ${ymd} html`);
  const text = await res.text();
  return parseRegShoFile(text, ymd);
}

/** Upstream Nasdaq Trader fetch. Safe to call from Node; Edge may be blocked. */
export async function fetchRegShoFromNasdaqTrader(
  timeoutMs?: number
): Promise<Map<string, RegShoListing>> {
  const dates = candidateRegShoTradeDates();
  const started = Date.now();
  let lastErr: Error | null = null;

  for (const ymd of dates) {
    if (timeoutMs != null && Date.now() - started >= timeoutMs) break;
    const remaining =
      timeoutMs != null ? Math.max(80, timeoutMs - (Date.now() - started)) : undefined;
    try {
      return await fetchRegShoFile(ymd, remaining);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error('regsho list unavailable');
}

function internalRegShoUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (explicit) return `${explicit}/api/regsho-threshold`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}/api/regsho-threshold`;
  return null;
}

async function fetchRegShoFromInternalApi(): Promise<Map<string, RegShoListing>> {
  const url = internalRegShoUrl();
  if (!url) throw new Error('regsho proxy url missing');
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`regsho proxy ${res.status}`);
  const json = (await res.json()) as { listings?: Record<string, RegShoListing> };
  if (!json.listings || Object.keys(json.listings).length === 0) {
    throw new Error('regsho proxy empty');
  }
  return regShoIndexFromRecord(json.listings);
}

export async function fetchRegShoIndex(): Promise<Map<string, RegShoListing>> {
  const now = Date.now();
  if (mem && mem.expires > now) return mem.index;

  try {
    return remember(await fetchRegShoFromNasdaqTrader(800));
  } catch (directErr) {
    console.warn(
      'regsho direct failed',
      directErr instanceof Error ? directErr.message : directErr
    );
    try {
      return remember(await fetchRegShoFromInternalApi());
    } catch (proxyErr) {
      console.warn(
        'regsho proxy failed',
        proxyErr instanceof Error ? proxyErr.message : proxyErr
      );
      throw directErr;
    }
  }
}

export async function lookupRegSho(ticker: string): Promise<RegShoListing> {
  const index = await fetchRegShoIndex();
  return listingFromRegShoIndex(index, ticker);
}
