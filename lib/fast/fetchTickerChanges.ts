// lib/fast/fetchTickerChanges.ts
// AskEdgar symbol-change history. GET https://eapi.askedgar.io/v1/ticker-changes
// Server-only. A recorded change is context for recycled tickers and former
// symbols — it does not change the fast verdict.
//
// Successful histories are cached for 7 days (Next data cache, plus an
// in-process copy) so a repeat scan does not spend another AskEdgar credit.

import { unstable_cache } from 'next/cache';
import type { TickerChangeEvent, TickerChanges } from './types';
import { readStoredTickerChanges, writeStoredTickerChanges } from './tickerChangeStore';

export const TICKER_CHANGES_URL = 'https://eapi.askedgar.io/v1/ticker-changes';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SUCCESS_TTL_MS = CACHE_TTL_SECONDS * 1000;
const ERROR_TTL_MS = 2 * 60 * 1000;
const MAX_SHOWN_EVENTS = 4;

const KEY_ENV_VARS = [
  'ASKEDGAR_API_KEY',
  'ASK_EDGAR_API_KEY',
  'ASKEDGAR_KEY',
  'ASK_EDGAR_KEY',
] as const;

const WARNING_LABELS: Record<string, string> = {
  reused_symbol: 'reused symbol (most recent history)',
  competing_destinations: 'competing destinations',
  multiple_issuers: 'unrelated issuer changes excluded',
};

type MemEntry = { expires: number; value: TickerChanges };
const mem = new Map<string, MemEntry>();
let creditsBlockedUntil = 0;

/** Test hook. Clears the in-process response cache and the credits cooldown. */
export function resetTickerChangeCacheForTests(): void {
  mem.clear();
  creditsBlockedUntil = 0;
}

export function askEdgarApiKey(): string | null {
  for (const name of KEY_ENV_VARS) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export function tickerChangesUnavailable(
  queryTicker: string,
  reason = 'error'
): TickerChanges {
  return {
    status: 'unavailable',
    queryTicker: queryTicker.trim().toUpperCase(),
    currentTicker: null,
    history: [],
    warnings: [],
    reason,
  };
}

function asSymbol(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function parseHistory(raw: unknown): TickerChangeEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: TickerChangeEvent[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as {
      old_ticker?: unknown;
      new_ticker?: unknown;
      effective_date?: unknown;
    };
    const oldTicker = asSymbol(row.old_ticker);
    const newTicker = asSymbol(row.new_ticker);
    const effectiveDate = String(row.effective_date ?? '').trim();
    if (!oldTicker || !newTicker || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) continue;
    events.push({ oldTicker, newTicker, effectiveDate });
  }
  return events;
}

function parseWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? '').trim()).filter(Boolean);
}

/** Map a 200 TickerChangesResponse into the overlay. Throws on an unusable body. */
export function parseTickerChangesPayload(json: unknown, queryTicker: string): TickerChanges {
  const root = json as {
    results?: Array<{
      query_ticker?: unknown;
      has_changes?: unknown;
      current_ticker?: unknown;
      history?: unknown;
      warnings?: unknown;
    }>;
  };
  const row = root?.results?.[0];
  if (!row || typeof row.has_changes !== 'boolean') {
    throw new Error('askedgar ticker-changes unexpected payload');
  }

  const normalizedQuery = asSymbol(row.query_ticker) || queryTicker.trim().toUpperCase();
  const history = parseHistory(row.history);
  const warnings = parseWarnings(row.warnings);

  if (!row.has_changes) {
    return {
      status: 'none',
      queryTicker: normalizedQuery,
      currentTicker: null,
      history: [],
      warnings,
    };
  }

  const currentRaw = row.current_ticker;
  const currentTicker =
    currentRaw == null || String(currentRaw).trim() === '' ? null : asSymbol(currentRaw);

  return {
    status: 'changed',
    queryTicker: normalizedQuery,
    currentTicker,
    history,
    warnings,
  };
}

/** Map the 409 ambiguous-lineage body. The chain is too long to trust. */
export function parseAmbiguousTickerLineage(json: unknown, queryTicker: string): TickerChanges {
  const root = json as {
    error?: {
      details?: { query_ticker?: unknown; tickers?: unknown; reason?: unknown };
    };
  };
  const details = root?.error?.details;
  const involvedTickers = Array.isArray(details?.tickers)
    ? details.tickers.map((ticker) => asSymbol(ticker)).filter(Boolean)
    : [];
  return {
    status: 'ambiguous',
    queryTicker: asSymbol(details?.query_ticker) || queryTicker.trim().toUpperCase(),
    currentTicker: null,
    history: [],
    warnings: [],
    involvedTickers,
    reason: String(details?.reason ?? 'max_hops_exceeded'),
  };
}

export function formatTickerChangeWarnings(warnings: string[]): string {
  return warnings.map((warning) => WARNING_LABELS[warning] ?? warning).join('; ');
}

function unavailableLabel(reason: string | undefined): string {
  switch (reason) {
    case 'no_api_key':
      return 'AskEdgar key not set';
    case 'auth':
      return 'AskEdgar key rejected';
    case 'credits':
      return 'AskEdgar credits too low';
    case 'forbidden':
      return 'AskEdgar endpoint not enabled';
    case 'rate_limit':
      return 'AskEdgar rate limited';
    case 'invalid_ticker':
      return 'ticker not accepted';
    default:
      return 'unavailable';
  }
}

/** One line for the verdict card, raw text, and the flag detail. */
export function formatTickerChangeSummary(changes: TickerChanges): string {
  if (changes.status === 'none') return 'no recorded changes';
  if (changes.status === 'unavailable') return unavailableLabel(changes.reason);
  if (changes.status === 'ambiguous') {
    const tickers = changes.involvedTickers?.filter(Boolean).join(', ');
    return tickers ? `history unreliable (${tickers})` : 'history unreliable';
  }

  const shown = changes.history.slice(-MAX_SHOWN_EVENTS);
  const hidden = changes.history.length - shown.length;
  const parts = shown.map(
    (event) => `${event.oldTicker} -> ${event.newTicker} (${event.effectiveDate})`
  );
  if (hidden > 0) parts.unshift(`+${hidden} earlier`);

  let summary = parts.join('; ');
  if (!summary) summary = 'recorded';

  const query = changes.queryTicker.toUpperCase();
  const current = changes.currentTicker?.toUpperCase() ?? null;
  if (current && current !== query) {
    summary = `now ${changes.currentTicker}; ${summary}`;
  }

  const warnings = formatTickerChangeWarnings(changes.warnings);
  if (warnings) summary = `${summary} · ${warnings}`;
  return summary;
}

export function tickerChangeFlag(changes: TickerChanges | null | undefined): string | null {
  if (!changes || changes.status === 'none' || changes.status === 'unavailable') return null;
  if (changes.status === 'ambiguous') {
    const tickers = changes.involvedTickers?.filter(Boolean).join(', ');
    return tickers
      ? `Ticker history unreliable — more than 12 linked changes (${tickers})`
      : 'Ticker history unreliable — more than 12 linked changes';
  }
  const summary = formatTickerChangeSummary(changes);
  return summary && summary !== 'recorded'
    ? `Past ticker change — ${summary}`
    : 'Past ticker change';
}

export function appendTickerChangeFlag(
  flags: string[],
  changes: TickerChanges | null | undefined
): string[] {
  const flag = tickerChangeFlag(changes);
  if (!flag) return flags;
  if (
    flags.some(
      (existing) =>
        existing.startsWith('Past ticker change') ||
        existing.startsWith('Ticker history unreliable')
    )
  ) {
    return flags;
  }
  return [...flags, flag];
}

export function tickerChangeTooltip(changes: TickerChanges | null | undefined): string {
  const base =
    'AskEdgar symbol-change history. A recorded change connects this ticker with an earlier symbol. Context only — it does not change the verdict and does not say the name is currently listed.';
  if (changes?.status === 'ambiguous') {
    return `${base} This chain has more than 12 linked changes, so it is not treated as reliable.`;
  }
  return base;
}

function remember(symbol: string, value: TickerChanges, ttlMs: number): TickerChanges {
  mem.set(symbol, { expires: Date.now() + ttlMs, value });
  return value;
}

class TickerChangesRequestError extends Error {
  constructor(readonly status: number) {
    super(`askedgar ticker-changes ${status}`);
    this.name = 'TickerChangesRequestError';
  }
}

function unavailableForStatus(status: number, symbol: string): TickerChanges | null {
  if (status === 401) return tickerChangesUnavailable(symbol, 'auth');
  if (status === 402) return tickerChangesUnavailable(symbol, 'credits');
  if (status === 403) return tickerChangesUnavailable(symbol, 'forbidden');
  if (status === 422) return tickerChangesUnavailable(symbol, 'invalid_ticker');
  if (status === 429) return tickerChangesUnavailable(symbol, 'rate_limit');
  return null;
}

function isMissingIncrementalCache(err: unknown): boolean {
  return err instanceof Error && err.message.includes('incrementalCache missing');
}

/** Network fetch. Throws on transient HTTP errors so they are not cached. */
async function fetchTickerChangesFromNetwork(symbol: string): Promise<TickerChanges> {
  if (Date.now() < creditsBlockedUntil) {
    throw new TickerChangesRequestError(402);
  }

  const key = askEdgarApiKey();
  if (!key) throw new Error('askedgar-no-api-key');

  const url = `${TICKER_CHANGES_URL}?ticker=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: {
      'API-KEY': key,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 402) {
    creditsBlockedUntil = Date.now() + ERROR_TTL_MS;
    throw new TickerChangesRequestError(402);
  }

  if (res.status === 409) {
    const json = await res.json().catch(() => null);
    return parseAmbiguousTickerLineage(json, symbol);
  }

  if (!res.ok) throw new TickerChangesRequestError(res.status);

  const json = await res.json();
  return parseTickerChangesPayload(json, symbol);
}

const loadCachedTickerChanges = unstable_cache(
  fetchTickerChangesFromNetwork,
  ['askedgar-ticker-changes-v1'],
  { revalidate: CACHE_TTL_SECONDS }
);

async function loadTickerChanges(symbol: string): Promise<TickerChanges> {
  try {
    return await loadCachedTickerChanges(symbol);
  } catch (err) {
    if (!isMissingIncrementalCache(err)) throw err;
    return fetchTickerChangesFromNetwork(symbol);
  }
}

function fromRequestError(symbol: string, err: unknown): TickerChanges | null {
  if (err instanceof Error && err.message === 'askedgar-no-api-key') {
    return remember(symbol, tickerChangesUnavailable(symbol, 'no_api_key'), ERROR_TTL_MS);
  }
  if (err instanceof TickerChangesRequestError) {
    const mapped = unavailableForStatus(err.status, symbol);
    if (mapped) return remember(symbol, mapped, ERROR_TTL_MS);
  }
  return null;
}

export async function fetchTickerChanges(ticker: string): Promise<TickerChanges> {
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z0-9.\-^]{1,6}$/.test(symbol)) {
    return tickerChangesUnavailable(symbol, 'invalid_ticker');
  }

  const cached = mem.get(symbol);
  if (cached && cached.expires > Date.now()) return cached.value;

  const stored = await readStoredTickerChanges(symbol);
  if (stored) return remember(symbol, stored, SUCCESS_TTL_MS);

  try {
    const value = await loadTickerChanges(symbol);
    await writeStoredTickerChanges(symbol, value);
    return remember(symbol, value, SUCCESS_TTL_MS);
  } catch (err) {
    const mapped = fromRequestError(symbol, err);
    if (mapped) return mapped;
    throw err;
  }
}
